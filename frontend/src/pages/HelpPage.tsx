import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { getHelpContent } from "../content/help";
import { HelpTimeline } from "../components/HelpTimeline";

export function HelpPage() {
  const { session } = useAuth();

  const content = useMemo(() => {
    if (!session) return null;
    return getHelpContent(session.role, session.shell);
  }, [session]);

  if (!content) {
    return <p className="text-gray-500">Загрузка...</p>;
  }

  const isAdmin = session?.shell === "admin";

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-xl font-serif font-bold text-vka-navy">Инструкция</h2>
        <p className="text-gray-600 mt-1">{content.roleLabel}</p>
        {session?.display_name && (
          <p className="text-sm text-gray-500 mt-0.5">Пост: {session.display_name}</p>
        )}
      </header>

      <section>
        <h3 className="font-serif font-bold text-vka-navy mb-3">О системе</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {content.about.map((section, i) => (
            <div
              key={i}
              className="bg-white rounded-lg shadow p-4 border-l-4 border-vka-navy"
            >
              <h4 className="font-semibold text-vka-navy text-sm">{section.title}</h4>
              <p className="text-gray-700 mt-2 text-base leading-relaxed">{section.text}</p>
            </div>
          ))}
        </div>
        {content.adminNote && (
          <p className="mt-4 text-base text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            {content.adminNote}
          </p>
        )}
      </section>

      {!isAdmin && content.steps.length > 0 && (
        <section className="bg-white rounded-lg shadow p-5 sm:p-6">
          <h3 className="font-serif font-bold text-vka-navy mb-5">{content.workflowTitle}</h3>
          <HelpTimeline steps={content.steps} />
        </section>
      )}

      <section>
        <h3 className="font-serif font-bold text-vka-navy mb-3">Словарь</h3>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-base">
            <tbody>
              {content.glossary.map((item, i) => (
                <tr
                  key={item.term}
                  className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
                >
                  <td className="py-3 px-4 font-medium text-vka-navy align-top w-36 sm:w-44">
                    {item.term}
                  </td>
                  <td className="py-3 px-4 text-gray-700 leading-relaxed">{item.definition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {content.faq.length > 0 && (
        <section>
          <h3 className="font-serif font-bold text-vka-navy mb-3">Если что-то не получается</h3>
          <div className="space-y-3">
            {content.faq.map((item, i) => (
              <details
                key={i}
                className="bg-white rounded-lg shadow group border border-gray-100"
              >
                <summary className="cursor-pointer px-4 py-3 font-medium text-vka-navy list-none flex items-center justify-between gap-2">
                  <span>{item.question}</span>
                  <span className="text-gray-400 text-sm group-open:rotate-180 transition-transform shrink-0">
                    ▼
                  </span>
                </summary>
                <p className="px-4 pb-4 text-base text-gray-700 leading-relaxed border-t border-gray-100 pt-3">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
