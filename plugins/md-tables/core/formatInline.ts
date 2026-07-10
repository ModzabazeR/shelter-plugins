export function formatInline(cell: string, doc: Document = document): Node[] {
  return parseSegment(cell, doc);
}

function parseSegment(text: string, doc: Document): Node[] {
  const nodes: Node[] = [];
  let buf = "";
  let i = 0;

  const flush = () => {
    if (buf) {
      nodes.push(doc.createTextNode(buf));
      buf = "";
    }
  };

  while (i < text.length) {
    const rest = text.slice(i);

    let m = /^`([^`]+)`/.exec(rest);
    if (m) {
      flush();
      const el = doc.createElement("code");
      el.textContent = m[1];
      nodes.push(el);
      i += m[0].length;
      continue;
    }

    m = /^(\*\*|__)(.+?)\1/.exec(rest);
    if (m) {
      flush();
      const el = doc.createElement("strong");
      el.append(...parseSegment(m[2], doc));
      nodes.push(el);
      i += m[0].length;
      continue;
    }

    m = /^~~(.+?)~~/.exec(rest);
    if (m) {
      flush();
      const el = doc.createElement("s");
      el.append(...parseSegment(m[1], doc));
      nodes.push(el);
      i += m[0].length;
      continue;
    }

    m = /^(\*|_)(?!\s)(.+?)(?<!\s)\1/.exec(rest);
    if (m) {
      flush();
      const el = doc.createElement("em");
      el.append(...parseSegment(m[2], doc));
      nodes.push(el);
      i += m[0].length;
      continue;
    }

    buf += text[i];
    i++;
  }

  flush();
  return nodes;
}
