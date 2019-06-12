import {cache} from './cache.js'
import {build} from './build.js'

const start = async () => {
  // Notice : Should put cache template in gh-pages/cache.html

  // ############################################
  // #### Generate Cache Page and ShortLink

  await cache(false)
  await build()
}

const main = async () => {
  console.log("⚠️  Warning: Only use for DEXON_BBS Dev")
  console.log("⚠️  Warning: use `npm run server` to Generate Cache")

  try {
    await start()
    process.exit(0)
  }
  catch (e) {
    console.log(e)
    process.exit(1)
  }
}

if (!module.parent.parent)
  main()


