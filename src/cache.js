import Web3 from 'web3'
import dotenv from 'dotenv/config'
import { pRateLimit } from 'p-ratelimit'
import fs from 'fs'
import path from 'path'

import { sitemapIntro, sitemapWrite, sitemapFinalize } from './sitemap.js'
import Dett from './lib/dett.js'
import LoomProvider from './loom.js'
import ShortURL from './lib/shortURL.js'

let dett = null
let loomWeb3 = null
let latestHeight = null
let contractOwner = '0x2089f8ef830f4414143686ed0dfac4f5bc0ace04'

const rpcRateLimiter = pRateLimit({
  interval: 2500,
  rate: 1,
  concurrency: 1,
})

const outputPath = 'dist'
const outputJsonPath = path.join(outputPath, 'output.json')
const sitemapPath = path.join(outputPath, 'sitemap.xml')

let jsonData = {}
let shortLinks = {}
let milestones = []

const addShortLink = async (tx) => {
  const shortLink = ShortURL.encode(dett.cacheweb3.utils.hexToNumber(tx.substr(0,10))).padStart(6,'0')
  const hexId = dett.cacheweb3.utils.padLeft(dett.cacheweb3.utils.toHex(shortLink), 64)

  const receipt = await dett.BBSCache.methods.link(tx, hexId).send({ from: contractOwner })
  if (receipt.status === true) {
    console.log('#Add ShortLink : '+tx+' '+shortLink)
    shortLinks[tx] = shortLink
  }
}

const addMilestone = async (blockNumber, index) => {
  const milestone = blockNumber+'-'+index
  const receipt = await dett.BBSCache.methods.addMilestone(loomWeb3.utils.utf8ToHex(milestone)).send({ from: contractOwner })
  if (receipt.status === true) {
    console.log('#Add Milestone : '+milestone)
    milestones.push(milestone)
  }
}

const syncContract = async () => {
  const events = await dett.BBSCache.getPastEvents('Link', {fromBlock : 0})

  for (const event of events) {
    const tx = event.returnValues.long
    const shortLink = event.returnValues.short
    shortLinks[tx] = loomWeb3.utils.hexToUtf8(shortLink)
  }

  saveLocalStorage()
  console.log('#Sync Done')
}

const checkSync =  async () => {
  let _milestones = await dett.BBSCache.methods.getMilestones().call({ from: contractOwner })
  _milestones = _milestones.map((milestone) => {
    return loomWeb3.utils.hexToUtf8(milestone)
  })

  if (!_milestones.every(e => milestones.includes(e))) {
    console.log('#Start Sync')
    milestones = _milestones
    await syncContract()
  }
}

const saveLocalStorage = () => {
  // if exist create output folder
  if (!(fs.existsSync(outputPath) && fs.lstatSync(outputPath).isDirectory()))
    fs.mkdirSync(outputPath)

  jsonData.shortLinks = shortLinks
  jsonData.milestones = milestones
  jsonData.latestHeight = latestHeight

  const rawData = JSON.stringify(jsonData, null, 4)
  fs.writeFileSync(outputJsonPath, rawData, 'utf8');
}

const loadLocalStorage = () => {
  // if exist create output folder
  if (!(fs.existsSync(outputPath) && fs.lstatSync(outputPath).isDirectory()))
    fs.mkdirSync(outputPath)

  // check dist/output.json
  if (fs.existsSync(outputJsonPath) && fs.lstatSync(outputJsonPath).isFile()) {
    const rawData = fs.readFileSync(outputJsonPath)
    jsonData = JSON.parse(rawData)

    if (jsonData.hasOwnProperty('shortLinks'))
      shortLinks = jsonData.shortLinks

    if (jsonData.hasOwnProperty('milestones'))
      milestones = jsonData.milestones

    if (jsonData.hasOwnProperty('latestHeight'))
      latestHeight = jsonData.latestHeight
  }
}

const saveSitemap = () => {
  const prefix = 'https://dett.cc'
  const f = fs.openSync(sitemapPath, 'w')
  sitemapIntro(f)
  {['/', '/about', '/mayday'].forEach(slug => {
    sitemapWrite(f, prefix + slug)
  })}
  fs.writeSync(f, '  <!-- Static pages below are generated; do not edit -->\n')
  Object.values(jsonData.shortLinks).forEach(slug => {
    sitemapWrite(f, prefix + '/s/' + slug)
  })
  sitemapFinalize(f)
}  

const mergedArticles = async (articles = [], fromBlock = '14440294', toBlock = 'latest') => {
  const temp = await dett.BBS.getPastEvents('Posted', {fromBlock : fromBlock, toBlock: toBlock})
  articles = articles.concat(temp)
  console.log(`from ${fromBlock} to ${toBlock}, size: ${articles.length}`)
  latestHeight = fromBlock
  saveLocalStorage()
  return articles
}


export const cache = async (updateAccess) => {
  // ############################################
  // #### init Dett
  
  const privateKeyString = process.env.LOOM_PRIVATEKEY

  const loomProvider =  new LoomProvider({
    chainId: 'default',
    writeUrl: 'https://loom-basechain.xxxx.nctu.me/rpc',
    readUrl: 'https://loom-basechain.xxxx.nctu.me/query',
    libraryName: 'web3.js',
    web3Api: Web3,
  })
  loomProvider.setNetworkOnly(privateKeyString)

  dett = new Dett()
  await dett.init(loomProvider)
  loomWeb3 = dett.loomProvider.library
  loadLocalStorage()

  await checkSync()
  // await cleanMilestone()

  let fromBlock = latestHeight ? latestHeight : dett.fromBlock
  let currentHeight = await loomWeb3.eth.getBlockNumber()

  if (milestones.length)
    fromBlock = +milestones[milestones.length-1].split('-')[0]

  let events = []
  const step = 10000
  for (let start = fromBlock*1 ; start < currentHeight ; start+=(step+1)) {
    events = await mergedArticles(events, start, start+step)
  }

  // delete lastest cache page block's part
  if (milestones.length)
    events.splice(0, (+milestones[milestones.length-1].split('-')[1]) + 1)

  // ############################################
  // #### Generate Cache && Short link

  let last = 0
  let index = 0
  for (const [i, event] of events.entries()) {
    const tx = event.transactionHash
    const blockNumber = event.blockNumber.toString()
    const link = await dett.BBSCache.methods.links(tx).call({ from: contractOwner })

    // generate short links
    if (!+(link))
      if (updateAccess)
        await addShortLink(tx, blockNumber)

    if (!(tx in shortLinks))
      shortLinks[tx] = loomWeb3.utils.hexToUtf8(link)

    // generate milestone block index
    if (last === blockNumber) {
      index += 1
    }
    else {
      last = blockNumber
      index = 0
    }

    if ((i+1) % dett.perPageLength === 0) {
      if (!milestones.includes(blockNumber+'-'+index)) {
        if (updateAccess)
          await addMilestone(blockNumber, index)
      }
    }
  }

  saveLocalStorage()

  saveSitemap()
}

const main = async () => {
  await cache(false)
  process.exit(0)
}

if (!module.parent.parent)
  main()

// feature && issue
// 2.log
// 3.master env set cache network
// 4.compress porblem

// clean cache
const cleanMilestone = async () => {
  const receipt = await dett.BBSCache.methods.clearMilestone().send({ from: contractOwner })
  if (receipt.status === true) console.log('#Clean Milestone Done.')
}

