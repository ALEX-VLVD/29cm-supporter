// Vercel Serverless Function - vlvd.kr 상품 이미지 스크래퍼
// 경로: api/cafe24.js

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { product_no, category = '0', page = '1' } = req.query;

  const fetchOpts = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'Referer': 'https://vlvd.kr/',
    }
  };

  try {
    // ── 단일 상품 이미지 ──
    if (product_no) {
      const url = `https://vlvd.kr/product/detail/${product_no}/`;
      const resp = await fetch(url, fetchOpts);
      if (!resp.ok) return res.status(200).json({ success: false, product_no, image_url: null });
      const html = await resp.text();

      // og:image 우선
      const og = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/)
                || html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/);
      if (og?.[1]) {
        let url = og[1];
        if (url.startsWith('//')) url = 'https:' + url;
        return res.status(200).json({ success: true, product_no, image_url: url });
      }

      // detail 이미지
      const imgs = [...html.matchAll(/(?:src|data-src)=["']((?:https?:)?\/\/[^"']*(?:detail|big|org|medium)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi)];
      if (imgs[0]) {
        let url = imgs[0][1];
        if (url.startsWith('//')) url = 'https:' + url;
        return res.status(200).json({ success: true, product_no, image_url: url });
      }

      return res.status(200).json({ success: false, product_no, image_url: null });
    }

    // ── 카테고리 스크래핑 ──
    const CATEGORIES = [
      'https://vlvd.kr/category/Shop/25/',
      'https://vlvd.kr/category/%EC%83%81%EC%9D%98/26/',
      'https://vlvd.kr/category/%ED%95%98%EC%9D%98/27/',
      'https://vlvd.kr/category/%EC%95%84%EC%9A%B0%ED%84%B0/28/',
      'https://vlvd.kr/category/%EC%95%A1%EC%84%B8%EC%84%9C%EB%A6%AC/29/',
    ];

    const catIdx = Math.min(parseInt(category), CATEGORIES.length - 1);
    const targetUrl = `${CATEGORIES[catIdx]}?page=${page}`;

    const resp = await fetch(targetUrl, fetchOpts);
    if (!resp.ok) return res.status(502).json({ error: `${resp.status}`, url: targetUrl });
    const html = await resp.text();

    const products = [];
    const seen = new Set();

    // 상품 번호와 이미지 추출
    const noPattern = /\/product\/[^\/]+\/(\d{5,8})\//g;
    const imgPattern = /(?:src|data-src|data-original)=["']((?:https?:)?\/\/[^"']*\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi;

    const nos = [...html.matchAll(noPattern)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i);
    const imgs = [...html.matchAll(imgPattern)]
      .map(m => m[1])
      .filter(u => !u.includes('noimage') && !u.includes('blank') && !u.includes('ico'));

    for (let i = 0; i < nos.length && i < imgs.length; i++) {
      if (seen.has(nos[i])) continue;
      seen.add(nos[i]);
      let imgUrl = imgs[i];
      if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
      products.push({ product_no: nos[i], image_url: imgUrl });
    }

    const hasNext = html.includes(`page=${parseInt(page)+1}`);

    return res.status(200).json({
      success: true,
      category: catIdx,
      page: parseInt(page),
      count: products.length,
      has_next: hasNext,
      products,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
