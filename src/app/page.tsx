import { supabase } from "@/lib/supabase";
import ThemeToggle from "@/components/theme-toggle";

export default async function Page() {
  const { data } = await supabase
    .from("news")
    .select("id,title,summary,url_cnn,url_rt")
    .order("created_at", { ascending: false });

  return (
    <main className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Unified News</h1>
        <ThemeToggle />
      </div>
      <div className="space-y-6">
        {data?.map((article) => (
          <article
            key={article.id}
            className="p-4 rounded-lg border bg-gray-50 dark:bg-gray-800"
          >
            <h2 className="text-2xl font-semibold mb-2">{article.title}</h2>
            <p className="mb-4">{article.summary}</p>
            <div className="flex gap-4 text-sm">
              <a
                href={article.url_cnn}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline"
              >
                CNN source
              </a>
              <a
                href={article.url_rt}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline"
              >
                RT source
              </a>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
