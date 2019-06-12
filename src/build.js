import Web3 from 'web3'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

import Dett from './lib/dett.js'
import { parseText } from './lib/utils.js'

const web3 = new Web3(new Web3.providers.WebsocketProvider('wss://mainnet-rpc.dexon.org/ws'))
let dett = null

const outputPath = 'dist'
const outputJsonPath = path.join(outputPath, 'output.json')
const outputCachePath = path.join(outputPath, 's')

const ghPath = 'gh-pages'
const ghCacheTemplatePath = path.join(ghPath, 'cache.html')

let shortLinks = {}
let jsonData = {}

function checksum(str, algorithm, encoding) {
  return  crypto
          .createHash(algorithm || 'sha256')
          .update(str, 'utf8')
          .digest(encoding || 'hex');
}

const loadLocalStorage = () => {
  if (!(fs.existsSync(outputJsonPath) && fs.lstatSync(outputJsonPath).isFile()))
    throw "output file is not exist"

  const rawData = fs.readFileSync(outputJsonPath)
  jsonData = JSON.parse(rawData)

  if (!jsonData.hasOwnProperty('shortLinks'))
    throw "invalid storage file"

  shortLinks = jsonData.shortLinks

  if (!jsonData.hasOwnProperty('checksum'))
    jsonData.checksum = ""
}

const saveLocalStorage = () => {
  const rawData = JSON.stringify(jsonData, null, 4)
  fs.writeFileSync(outputJsonPath, rawData, 'utf8');
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
  const template = fs.readFileSync(ghCacheTemplatePath, 'utf-8')

  const cacheFile = template.replace(reg, (matched) => {
    return cacheMeta[matched]
  });

  const filePath = path.join(outputCachePath, shortLinks[tx] + '.html')
  await fs.writeFileSync(filePath, cacheFile, 'utf8')
}

export const build = async () => {
  loadLocalStorage()

  dett = new Dett()
  await dett.init(web3, Web3)

  // if cache output folder not exist create it
  if (!(fs.existsSync(outputCachePath) && fs.lstatSync(outputCachePath).isDirectory()))
    fs.mkdirSync(outputCachePath)

  if (!(fs.existsSync(ghCacheTemplatePath) && fs.lstatSync(ghCacheTemplatePath).isFile()))
    throw "template file is not exist"

  const _checksum = checksum(fs.readFileSync(ghCacheTemplatePath))
  const shouldUpdate = _checksum !== jsonData.checksum

  if (shouldUpdate)
    jsonData.checksum = _checksum

  for (const tx of Object.keys(shortLinks)) {
    const shortLinkPath = path.join(outputCachePath, shortLinks[tx]+'.html')

    if (shouldUpdate || !(fs.existsSync(shortLinkPath) && fs.lstatSync(shortLinkPath).isFile()))
      await generateShortLinkCachePage(tx, shortLinks[tx])
  }

  saveLocalStorage()

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