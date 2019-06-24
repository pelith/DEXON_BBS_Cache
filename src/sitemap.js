import fs from 'fs'

function sitemapIntro(fd) {
  fs.writeSync(fd, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`, 'utf-8')
}

function sitemapWrite(fd, url) {
  fs.writeSync(fd, `\
  <url>
    <loc>${url}</loc>
  </url>\n`)
}

function sitemapFinalize(fd) {
  fs.writeSync(fd, `</urlset>\n`, 'utf-8')
}

export { sitemapIntro, sitemapWrite, sitemapFinalize }
