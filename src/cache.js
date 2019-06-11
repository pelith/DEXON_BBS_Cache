import Web3 from 'web3'
import dotenv from 'dotenv/config'

import { pRateLimit } from 'p-ratelimit'
import fs from 'fs'
import path from 'path'

import Dett from './dett.js'
import ShortURL from './shortURL.js'
import { parseText, awaitTx } from './utils.js'

import keythereum from 'keythereum'

const web3 = new Web3(new Web3.providers.WebsocketProvider('wss://mainnet-rpc.dexon.org/ws'))
let dett = null
let contractOwner = ''

const rpcRateLimiter = pRateLimit({
  interval: 2500,
  rate: 1,
  concurrency: 1,
})

const outputPath = 'dist'
const outputJsonPath = path.join(outputPath, 'output.json')

let jsonData = {}
let shortLinks = {}
let milestones = []
let indexes = []

const addShortLink = async (tx) => {
  const shortLink = ShortURL.encode(dett.cacheweb3.utils.hexToNumber(tx.substr(0,10))).padStart(6,'0')
  const hexId = dett.cacheweb3.utils.padLeft(dett.cacheweb3.utils.toHex(shortLink), 64)

  await awaitTx(
    dett.BBSCache.methods.link(tx, hexId).send({
      from: contractOwner,
      gas: 240000,
    })
  ).then((receipt) => {
    console.log('#Add ShortLink : '+tx+' '+shortLink)
    shortLinks[tx] = shortLink
  })
}

const addMilestone = async (blockNumber, index) => {
  await awaitTx(
    dett.BBSCache.methods.addMilestone(+blockNumber, index).send({
      from: contractOwner,
      gas: 240000,
    })
  ).then((receipt) => {
    console.log('#Add Milestone : '+blockNumber+'-'+index)
    milestones.push(+blockNumber)
    indexes.push(index)
  })
}

const syncContract = async () => {
  const events = await dett.BBSCache.getPastEvents('Link', {fromBlock : 0})

  for (const event of events) {
    const tx = event.returnValues.long
    const shortLink = event.returnValues.short
    shortLinks[tx] = web3.utils.hexToUtf8(shortLink)
  }

  milestones = await dett.BBSCache.methods.getMilestones().call()
  indexes = await dett.BBSCache.methods.getIndexes().call()
  saveLocalStorage()
  console.log('#Sync Done')
}

const checkSync =  async () => {
  const _indexes = await dett.BBSCache.methods.getIndexes().call()
  if (!_indexes.every(e => indexes.includes(e))) {
    console.log('#Start Sync')
    await syncContract()
  }
}

const saveLocalStorage = () => {
  // if exist create output folder
  if (!(fs.existsSync(outputPath) && fs.lstatSync(outputPath).isDirectory()))
    fs.mkdirSync(outputPath)

  jsonData.shortLinks = shortLinks
  jsonData.milestones = milestones
  jsonData.indexes = indexes

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

    if (jsonData.hasOwnProperty('indexes'))
      indexes = jsonData.indexes
  }
}


export const generateCacheAndShortLink = async (updateAccess) => {
  // ############################################
  // #### init Dett

  dett = new Dett()
  await dett.init(web3, Web3)

  loadLocalStorage()

  await checkSync()

  if (updateAccess) {
    const keystore = JSON.parse(fs.readFileSync('keystore.json'))
    const keypassword = process.env.KEY_PASSWORD
    const privateKey = keythereum.recover(keypassword, keystore)

    const account = dett.cacheweb3.eth.accounts.privateKeyToAccount(`0x${privateKey.toString('hex')}`)
    contractOwner = account.address
    dett.cacheweb3.eth.accounts.wallet.add(account)
  }

  let fromBlock = dett.fromBlock

  const hasLocalMilestones = milestones.length && indexes.length

  if (hasLocalMilestones)
    fromBlock = +milestones[milestones.length-1]

  let events = await dett.BBS.getPastEvents('Posted', {fromBlock : fromBlock})

  // delete lastest cache page block's part
  if (hasLocalMilestones)
    events.splice(0, (+indexes[indexes.length-1]) + 1)

  // ############################################
  // #### Generate Cache && Short link

  let last = 0
  let index = 0
  for (const [i, event] of events.entries()) {
    const tx = event.transactionHash
    const blockNumber = event.blockNumber.toString()
    const link = await dett.BBSCache.methods.links(tx).call()

    // generate short links
    if (!+(link))
      if (updateAccess)
        await rpcRateLimiter(() => addShortLink(tx, blockNumber))

    // generate milestone block index
    if (last === blockNumber) {
      index += 1
    }
    else {
      last = blockNumber
      index = 0
    }

    if ((i+1) % dett.perPageLength === 0) {
      if (!milestones.includes(blockNumber)){
        if (!(indexes[milestones.indexOf(blockNumber)] === index+''))
          if (updateAccess)
            await rpcRateLimiter(() => addMilestone(blockNumber, index))
      }
    }
  }

  saveLocalStorage()
}

const main = async () => {
  await generateCacheAndShortLink(false)
  process.exit(0)
}

if (!module.parent.parent)
  main()

// feature && issue
// 2.log
// 3.master env set cache network
// 4.compress porblem
// 5.circle ci cache server && need fix src problem

// clean cache
// await dett.BBSCache.methods.clearMilestone().send({
//   from: contractOwner,
//   // gasPrice: 6000000000,
//   gas: 210000,
// })
