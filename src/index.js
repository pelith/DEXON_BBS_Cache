import fs from 'fs'
import path from 'path'

import git from 'simple-git'
import gitP from 'simple-git/promise'

import rsync from 'rsyncwrapper'
import dotenv from 'dotenv/config'
import cloudflarePurgeCache from 'cloudflare-purge-cache'

import {generateCacheAndShortLink} from './cache.js'

const outputPath = 'dist'
const outputJsonPath = path.join(outputPath, 'output.json')
const outputCachePath = path.join(outputPath, 's')
const outputCacheTemplatePath = path.join(outputPath, 'cache.html')

const ghPath = 'gh-pages'
const ghCachePath = path.join(ghPath, 's')
const ghCacheTemplatePath = path.join(ghPath, 'cache.html')


const clone = async () => {
  //delete gh-pages folder
  if (fs.existsSync('gh-pages') && fs.lstatSync('gh-pages').isDirectory())
    await rimraf.sync('gh-pages')

  await gitP().silent(true)
  .clone('https://github.com/pelith/DEXON_BBS', 'gh-pages', ['--single-branch','--branch','gh-pages'])
  .then(() => console.log('#Clone Done.'))
  .catch((err) => console.error('failed: ', err))
}

const rsyncCopyDir = (src, dest) => {
  return new Promise((resolve, reject) => {
    rsync({
      src: path.join(src, '/'),
      dest: dest,
      recursive: true,
    }, (error, stdout, stderr, cmd) => {
      if (error) {
        // failed
        console.log(error.message)
        reject(error.message)
      } else {
        // success
        resolve()
      }
    })
  })
}

export const start = async () => {
  const hrstart = process.hrtime()

  // ############################################
  // #### Clone dett gh-page branch

  if (fs.existsSync(ghPath) && fs.lstatSync(ghPath).isDirectory()) {
    await gitP(__dirname + '/../gh-pages/').fetch()
    const status = await gitP(__dirname + '/../gh-pages/').status()
    if (status.behind || status.ahead)
      await clone()
  }
  else
    await clone()

  // ############################################
  // #### Generate Cache Page and ShortLink

  await generateCacheAndShortLink()

  // ############################################
  // #### Commit & push

  await rsyncCopyDir(outputCachePath, ghCachePath)

  await gitP(__dirname + '/../gh-pages/').add('.')
  await gitP(__dirname + '/../gh-pages/').commit("Add cache page")

  const status = await gitP(__dirname + '/../gh-pages/').status()
  if (status.behind || status.ahead) {
    await gitP(__dirname + '/../gh-pages/').push(['-u', 'origin', 'gh-pages'])
          .then(console.log('#Push Done.'))

    await cloudflarePurgeCache(process.env.CF_EMAIL, process.env.CF_KEY, process.env.CF_ZONE_ID)
  }

  const hrend = process.hrtime(hrstart)
  console.info(`Execution time (hr): %ds %dms`, hrend[0], hrend[1] / 1000000)
}

const main = async () => {
  await start()
}

if (!module.parent.parent)
  main()


