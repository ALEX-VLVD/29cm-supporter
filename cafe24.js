// Vercel Serverless Function - vlvd.kr 상품 스크래퍼
// 경로: api/cafe24.js

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { page = 1, limit = 30 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const categories = [
      'https://vlvd.kr/category/Shop/25/?page=' + page,
      'https://vlvd.kr/category/%EC%83%81%EC%9D%98/26/?page=' + page,
      'https://vlvd.kr/category/%ED%95%98%EC%9D%98/27/?page=' + page,
      'https://vlvd.kr/category/%EC%95%84%EC%9A%B0%ED%84%B0/28/?page=' + page,
      'https://vlvd.kr/category/%EC%95%A1%EC%84%B8%EC%84%9C%EB%A6%AC/29/?page=' + page,
    ];

    const targetUrl = req.query.url
      ? decodeURIComponent(req.query.url)
      : categories[0];

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://vlvd.kr/',
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: `vlvd.kr 응답 오류: ${response.status}` });
    }

    const html = await response.text();

    // 상품 파싱 (Cafe24 공통 구조)
    const products = [];

    // 상품 번호 추출
    const productNoRegex = /\/product\/[^\/]+\/(\d+)\//g;
    const imgRegex = /<img[^>]+src=["']([^"']*(?:product|goods)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
    const nameRegex = /class="[^"]*prd[-_]?name[^"]*"[^>]*>\s*<[^>]+>\s*([^<]+)/gi;
    const priceRegex = /class="[^"]*price[^"]*"[^>]*>\s*([0-9,]+)\s*원/gi;

    // 상품 링크 기반 파싱
    const productLinkRegex = /href="(\/product\/[^"]+\/(\d+)\/[^"]*)"[^>]*>[\s\S]*?<img[^>]+(?:src|data-src)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["'][^>]*>[\s\S]*?(?:class="[^"]*(?:name|title)[^"]*"[^>]*>([^<]+))?/gi;

    // 더 단순한 파싱: 모든 상품 이미지와 이름 추출
    const listPattern = /xans-record-[^"]*"[\s\S]*?href="(\/product\/([^"]+)\/(\d+)\/[^"]*)"[\s\S]*?(?:data-src|src)="([^"]*(?:product|prd)[^"]*\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[\s\S]*?(?:<p[^>]*>|<span[^>]*>|<strong[^>]*>)\s*([^<\n]+?)(?:\s*<\/(?:p|span|strong)>)/gi;

    let match;
    const seen = new Set();

    while ((match = listPattern.exec(html)) !== null) {
      const [, path, , productNo, imgSrc, name] = match;
      if (seen.has(productNo)) continue;
      seen.add(productNo);

      let imageUrl = imgSrc;
      if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
      if (imageUrl.startsWith('/')) imageUrl = 'https://vlvd.kr' + imageUrl;

      products.push({
        product_no: productNo,
        product_name: name.trim(),
        image_url: imageUrl,
        product_url: 'https://vlvd.kr' + path,
      });
    }

    // 패턴이 안 맞으면 fallback: 이미지와 상품번호 별도 추출
    if (products.length === 0) {
      const imgMatches = [...html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']*(?:200x200|300x300|product|goods)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi)];
      const noMatches = [...html.matchAll(/\/product\/[^\/]+\/(\d+)\//g)];
      const nameMatches = [...html.matchAll(/class="[^"]*(?:name|title)[^"]*"[^>]*>[\s\S]*?<[^>]*>\s*([^\n<]{3,50})/gi)];

      const count = Math.min(imgMatches.length, noMatches.length);
      for (let i = 0; i < count; i++) {
        if (seen.has(noMatches[i][1])) continue;
        seen.add(noMatches[i][1]);

        let imageUrl = imgMatches[i][1];
        if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;

        products.push({
          product_no: noMatches[i][1],
          product_name: nameMatches[i] ? nameMatches[i][1].trim() : `상품 ${noMatches[i][1]}`,
          image_url: imageUrl,
          product_url: `https://vlvd.kr/product/detail/${noMatches[i][1]}/`,
        });
      }
    }

    // 다음 페이지 존재 여부
    const hasNext = html.includes('다음') || html.includes('next') ||
      new RegExp(`page=${parseInt(page) + 1}`).test(html);

    return res.status(200).json({
      success: true,
      page: parseInt(page),
      count: products.length,
      has_next: hasNext,
      products,
      source_url: targetUrl,
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message,
      detail: '서버에서 vlvd.kr 접근 중 오류가 발생했어요.'
    });
  }
}
