import Web3 from 'web3'
import dotenv from 'dotenv/config'

import { CryptoUtils, Client, LoomProvider } from 'loom-js'
import { pRateLimit } from 'p-ratelimit'
import fs from 'fs'
import path from 'path'

import { sitemapIntro, sitemapWrite, sitemapFinalize } from './sitemap.js'
import Dett from './lib/dett.js'
import ShortURL from './lib/shortURL.js'

const chainId = 'extdev-plasma-us1'
const writeUrl = 'wss://extdev-plasma-us1.dappchains.com/websocket'
const readUrl = 'wss://extdev-plasma-us1.dappchains.com/queryws'
const web3Provider = new Web3.providers.WebsocketProvider('wss://rinkeby.infura.io/ws/v3/')
const web3 = new Web3(web3Provider)
let dett = null
let contractOwner = '0x9ffa184a0d0febc143ceaae94cf2a4079cec9349'

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
  const receipt = await dett.BBSCache.methods.addMilestone(web3.utils.utf8ToHex(milestone)).send({ from: contractOwner })
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
    shortLinks[tx] = web3.utils.hexToUtf8(shortLink)
  }

  saveLocalStorage()
  console.log('#Sync Done')
}

const checkSync =  async () => {
  let _milestones = await dett.BBSCache.methods.getMilestones().call({ from: contractOwner })
  _milestones = _milestones.map((milestone) => {
    return web3.utils.hexToUtf8(milestone)
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


export const cache = async (updateAccess) => {
  // ############################################
  // #### init Dett
  const privateKeyStr = process.env.LOOM_PRIVATEKEY
  const privateKey = CryptoUtils.B64ToUint8Array(privateKeyStr)
  const client = new Client(chainId, writeUrl, readUrl)
  const loomProvider = new LoomProvider(client, privateKey)
  
  dett = new Dett()
  await dett.init(loomProvider, web3, Web3)
  loadLocalStorage()

  await checkSync()
  // await cleanMilestone()

  let fromBlock = dett.fromBlock

  if (milestones.length)
    fromBlock = +milestones[milestones.length-1].split('-')[0]

  let events = await dett.BBS.getPastEvents('Posted', {fromBlock : fromBlock})

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
      shortLinks[tx] = web3.utils.hexToUtf8(link)

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

