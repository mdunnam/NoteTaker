/**
 * NoteContentRenderer — simple line-by-line content renderer, no external libs.
 */

interface Props {
  content: string;
}

export default function NoteContentRenderer({ content }: Props) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={key++} className="my-2 list-disc pl-6 space-y-1 text-gray-800">
        {listBuffer.map((item, i) => (
          <li key={i} className="text-base">{item}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  for (const line of lines) {
    if (line.startsWith("### ")) {
      flushList();
      elements.push(<h4 key={key++} className="mt-4 mb-1 text-base font-semibold text-gray-800">{line.slice(4)}</h4>);
    } else if (line.startsWith("## ")) {
      flushList();
      elements.push(<h3 key={key++} className="mt-5 mb-1 text-lg font-semibold text-gray-900">{line.slice(3)}</h3>);
    } else if (line.startsWith("# ")) {
      flushList();
      elements.push(<h2 key={key++} className="mt-6 mb-2 text-xl font-bold text-gray-900">{line.slice(2)}</h2>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      listBuffer.push(line.slice(2));
    } else if (line.trim() === "") {
      flushList();
      elements.push(<div key={key++} className="my-2" />);
    } else {
      flushList();
      elements.push(<p key={key++} className="text-base text-gray-900 leading-relaxed">{line}</p>);
    }
  }
  flushList();

  return <div className="space-y-0.5">{elements}</div>;
}
