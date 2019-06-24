
function sitemapIntro(stream) {
  stream.write(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`, 'utf-8')
}

function sitemapWrite(stream, url) {
  stream.write(`\
  <url>
    <loc>${url}</loc>
  </url>\n`)
}

function sitemapFinalize(stream) {
  stream.write(`</urlset>\n`, 'utf-8')
  stream.end()
}

export { sitemapIntro, sitemapWrite, sitemapFinalize }
