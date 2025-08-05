import 'dotenv/config';
import puppeteer from 'puppeteer';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

interface Article {
  title: string;
  url: string;
  paragraphs: string[];
}

const definedTags = [
  "Politics", "Economy", "Health", "Education", "Technology",
  "Environment", "Sports", "Entertainment", "Science", "Business",
  "Culture", "Law", "Social Issues", "Infrastructure", "Agriculture",
  "Energy", "Space", "Automotive", "Fashion", "Travel",
  "Food", "Religion", "Art", "Music", "Film",
  "Literature", "Theatre", "Gaming", "Virtual Reality", "Augmented Reality",
  "Cybersecurity", "Robotics", "AI", "Machine Learning", "Blockchain",
  "Cryptocurrency", "3D Printing", "Mobile Technology", "Telecommunications", "Biotechnology",
  "Pharmaceuticals", "Public Health", "Mental Health", "Wellness", "Fitness",
  "Nutrition", "Diseases", "Epidemics", "Pandemics", "Vaccination",
  "North America", "Latin America", "Caribbean", "Western Europe", "Eastern Europe",
  "Northern Europe", "Southern Europe", "Central Asia", "East Asia", "South Asia",
  "Southeast Asia", "Middle East", "North Africa", "Sub-Saharan Africa", "Australia",
  "New Zealand", "Pacific Islands", "Antarctica", "Global", "International Relations",
  "USA", "Canada", "Mexico", "Brazil", "Argentina",
  "UK", "Germany", "France", "Italy", "Spain",
  "Russia", "China", "India", "Japan", "South Korea",
  "Indonesia", "Nigeria", "South Africa", "Egypt", "Turkey",
  "Iran", "Saudi Arabia", "UAE", "Israel", "Australia",
  "New Zealand", "Pakistan", "Bangladesh", "Vietnam", "Thailand",
  "Breaking News", "Analysis", "Opinion", "Editorial", "Feature",
  "Investigative Reporting", "Interview", "Documentary", "Announcement", "Update",
  "Recap", "Summary", "Preview", "Review", "Commentary",
  "Profile", "Exposé", "Backgrounder", "Fact Check", "Op-Ed",
  "Climate Change", "Global Warming", "Renewable Energy", "Conservation", "Wildlife",
  "Pollution", "Sustainable Development", "Human Rights", "Civil Rights", "Gender Equality",
  "LGBTQ Rights", "Racial Equality", "Immigration", "Refugee Crisis", "Terrorism",
  "War", "Peace Talks", "Nuclear Proliferation", "Espionage", "Cyber Attack",
  "Elections", "Corruption", "Judiciary", "Legislation", "Trade Agreements",
  "Economic Sanctions", "Stock Market", "Recession", "Inflation", "Unemployment",
  "Workplace", "Labor Rights", "Education Reform", "Public Safety", "Crime",
  "Policing", "Legal Trials", "Supreme Court", "Congress", "Parliament",
  "Protests", "Demonstrations", "Festivals", "Awards", "Celebrations",
  "Obituaries", "Memorials", "Anniversaries", "Historical Events", "Archaeological Finds"
];

function similarity(a: string, b: string) {
  const setA = new Set(a.toLowerCase().split(/\W+/));
  const setB = new Set(b.toLowerCase().split(/\W+/));
  const intersection = Array.from(setA).filter((x) => setB.has(x)).length;
  return intersection / Math.max(setA.size, setB.size);
}

async function extractCNN(browser: puppeteer.Browser): Promise<Article[]> {
  const page = await browser.newPage();
  await page.goto('https://edition.cnn.com/world');
  const links = await page.$$eval('.container__link--type-article', nodes =>
    nodes.map(n => ({
      href: (n as HTMLAnchorElement).getAttribute('href'),
      text: (n.querySelector('.container__headline-text') as HTMLElement)?.innerText || ''
    }))
  );
  const articles: Article[] = [];
  for (const { href, text } of links.slice(0, 5)) {
    if (!href) continue;
    await page.goto('https://edition.cnn.com' + href, { waitUntil: 'networkidle2' });
    const paragraphs = await page.$$eval('.article__content p', ps => ps.map(p => (p as HTMLElement).innerText.trim()));
    articles.push({ title: text, url: 'https://edition.cnn.com' + href, paragraphs });
  }
  return articles;
}

async function extractRT(browser: puppeteer.Browser): Promise<Article[]> {
  const page = await browser.newPage();
  await page.goto('https://www.rt.com/');
  const links = await page.$$eval(
    'li.card-list__item strong.card__header a',
    nodes =>
      nodes.map(n => ({
        href: (n as HTMLAnchorElement).getAttribute('href') || '',
        text: (n as HTMLElement).innerText.trim()
      }))
  );
  const articles: Article[] = [];
  for (const { href, text } of links.slice(0, 5)) {
    if (!href) continue;
    const url = new URL(href, 'https://www.rt.com').toString();
    await page.goto(url, { waitUntil: 'networkidle2' });
    const paragraphs = await page.$$eval('div.article__text p', ps =>
      ps.map(p => (p as HTMLElement).innerText.trim())
    );
    articles.push({ title: text, url, paragraphs });
  }
  return articles;
}

async function main() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const browser = await puppeteer.launch({ headless: true });
  const cnn = await extractCNN(browser);
  const rt = await extractRT(browser);
  await browser.close();

  for (const c of cnn) {
    let best: Article | null = null;
    let bestScore = 0;
    for (const r of rt) {
      const score = similarity(c.title, r.title);
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    if (!best) continue;

    const contentA = c.paragraphs.join('\n');
    const contentB = best.paragraphs.join('\n');
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are an unbiased journalist.' },
        {
          role: 'user',
          content: `Combine the following two articles into a single neutral report referencing both CNN and RT. Give me a JSON object with {title, summary, tags, content}. Tags must be from this list: ${definedTags.join(', ')}.\n\nCNN article:\n${contentA}\n\nRT article:\n${contentB}`
        }
      ]
    });

    const text = response.choices[0].message?.content || '';
    const json = JSON.parse(text);

    await supabase.from('news').insert({
      title: json.title,
      summary: json.summary,
      content: Array.isArray(json.content) ? json.content : [json.content],
      tags: json.tags,
      url_cnn: c.url,
      url_rt: best.url
    });
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
