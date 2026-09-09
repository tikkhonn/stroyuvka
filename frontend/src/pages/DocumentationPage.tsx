const USTAVY_PDF = "/docs/ustavy.pdf";
const USTAVY_COVER = "/docs/ustavy-cover.jpg";
/* const USTAVY_TITLE = "Общевоинские уставы ВС РФ"; */

export function DocumentationPage() {
  return (
    <div>
      <h2 className="text-xl font-serif font-bold text-vka-navy mb-4">Документация</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <a
          href={USTAVY_PDF}
          target="_blank"
          rel="noopener noreferrer"
          className="group block max-w-[220px] rounded-lg bg-white p-3 shadow transition-shadow hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-vka-gold"
        >
          <div className="overflow-hidden rounded-md border border-gray-100">
            <img
              src={USTAVY_COVER}
              /* alt={USTAVY_TITLE} */
              className="aspect-[2/3] w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          </div>
          {/* <p className="mt-3 text-sm font-medium leading-snug text-vka-navy">{USTAVY_TITLE}</p> */}
        </a>
      </div>
    </div>
  );
}
