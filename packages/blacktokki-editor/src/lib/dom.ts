const parser = new DOMParser();

export function extractHtmlLinks(text: string) {
  // 링크 이름과 주소 추출
  const doc = parser.parseFromString(text, 'text/html');
  const links = doc.querySelectorAll('a');

  const matches = Array.from(links).map((a) => ({
    text: a.textContent?.trim() || a.href,
    url: a.href,
  }));

  return matches;
}

export function cleanHtml(
  html: string,
  cleanCode: boolean,
  cleanAnchorTitle: boolean,
  mergeTds: boolean
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 1. <code> 태그 내부 비우기
  if (cleanCode) {
    const codeTags = doc.querySelectorAll('code');
    codeTags.forEach((code) => {
      code.textContent = '';
    });
  }
  // 2. <a> 태그 내부 비우기
  const aTags = doc.querySelectorAll('a');
  aTags.forEach((a) => {
    if (cleanAnchorTitle) {
      a.textContent = '';
    } else {
      a.href = '';
    }
  });
  if (mergeTds) {
    // 3. 각 <tr> 안의 <td> 병합
    const trList = doc.querySelectorAll('tr');
    trList.forEach((tr) => {
      const tdList = tr.querySelectorAll('td');
      if (tdList.length > 1) {
        const mergedText = Array.from(tdList)
          .map((td) => td.textContent?.trim() || '')
          .join(' ');

        // 첫 td에 병합된 텍스트 설정
        const newTd = document.createElement('td');
        newTd.textContent = mergedText;

        // 기존 td 모두 제거 후 병합 td 삽입
        tr.innerHTML = '';
        tr.appendChild(newTd);
      }
    });
  }
  return doc.body.innerHTML;
}

export function findLists(html: string): { type: 'ul' | 'ol'; items: string[] }[] {
  // 리스트 추출
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const results: { type: 'ul' | 'ol'; items: string[] }[] = [];

  const listTags = ['ul', 'ol'] as const;

  listTags.forEach((tag) => {
    const lists = Array.from(doc.querySelectorAll(tag));

    lists.forEach((list) => {
      const items: string[] = [];

      const liElements = list.querySelectorAll('li');
      liElements.forEach((li) => {
        // li 요소 내 중첩 리스트는 제거하고 텍스트만 추출
        const cloned = li.cloneNode(true) as HTMLElement;

        // 중첩된 리스트 제거
        cloned.querySelectorAll('ul, ol').forEach((nested) => nested.remove());

        items.push(cloned.textContent?.trim() || '');
      });

      results.push({ type: tag, items });
    });
  });

  return results;
}
