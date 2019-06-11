import Web3 from 'web3'
import fs from 'fs'
import path from 'path'

import Dett from './dett.js'
import { parseText } from './utils.js'

const web3 = new Web3(new Web3.providers.WebsocketProvider('wss://mainnet-rpc.dexon.org/ws'))
let dett = null

const outputPath = 'dist'
const outputJsonPath = path.join(outputPath, 'output.json')
const outputCachePath = path.join(outputPath, 's')
const outputCacheTemplatePath = path.join(outputPath, 'cache.html')

const ghPath = 'gh-pages'
const ghCacheTemplatePath = path.join(ghPath, 'cache.html')

let shortLinks = {}

const loadLocalStorage = () => {
  if (!(fs.existsSync(outputJsonPath) && fs.lstatSync(outputJsonPath).isFile()))
    throw "output file is not exist"

  const rawData = fs.readFileSync(outputJsonPath)
  const jsonData = JSON.parse(rawData)

  if (!jsonData.hasOwnProperty('shortLinks'))
    throw "invalid storage file"

  shortLinks = jsonData.shortLinks
}

const generateShortLinkCachePage = async (tx) => {
  const article = await dett.getArticle(tx)
  const title = article.title
  const url = 'https://dett.cc/' + shortLinks[tx] + '.html'
  const description = parseText(article.content, 160).replace(/\n|\r/g, ' ')
  const cacheMeta = { 'Cache - DEXON BBS': title,
                      'https://dett.cc/cache.html': url,
                      'Cache Cache Cache Cache Cache': description,
                      'dett:tx:content': tx }
  const reg = new RegExp(Object.keys(cacheMeta).join("|"),"gi")
  const template = fs.readFileSync('gh-pages/cache.html', 'utf-8')

  const cacheFile = template.replace(reg, (matched) => {
    return cacheMeta[matched]
  });

  const filePath = path.join(outputCachePath, shortLinks[tx] + '.html')
  await fs.writeFileSync(filePath, cacheFile, 'utf8')
}

const build = async () => {
  loadLocalStorage()

  dett = new Dett()
  await dett.init(web3, Web3)

  // if cache output folder not exist create it
  if (!(fs.existsSync(outputCachePath) && fs.lstatSync(outputCachePath).isDirectory()))
    fs.mkdirSync(outputCachePath)

  if (!(fs.existsSync(outputCacheTemplatePath) && fs.lstatSync(outputCacheTemplatePath).isFile()))
    fs.copyFileSync(ghCacheTemplatePath, outputCacheTemplatePath)

  // 0 = equal, 1 = not equal
  const checkUpdated = Buffer.compare(fs.readFileSync(ghCacheTemplatePath), fs.readFileSync(outputCacheTemplatePath))

  if (checkUpdated) fs.copyFileSync(ghCacheTemplatePath, outputCacheTemplatePath)

  for (const tx of Object.keys(shortLinks)) {
    const shortLinkPath = path.join(outputCachePath, shortLinks[tx]+'.html')

    if (checkUpdated || !(fs.existsSync(shortLinkPath) && fs.lstatSync(shortLinkPath).isFile()))
      await generateShortLinkCachePage(tx, shortLinks[tx])
  }
  console.log('#Generate Cache Page Done.')
}

const main = async () => {
  try {
    await build()
    process.exit(0)
  }
  catch (e) {
    console.log(e)
    process.exit(1)
  }
}

if (!module.parent.parent)
  main()