interface Props {
  text: string;
  query: string;
}

export function HighlightedText({ text, query }: Props) {
  if (!query.trim()) return <>{text}</>;

  // Escapar caracteres especiales del query para la Regex
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escapedQuery})`, "gi"));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            className="bg-blue-100 text-blue-700 font-bold rounded-sm px-0.5"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}