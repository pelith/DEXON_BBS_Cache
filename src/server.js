import {generateCacheAndShortLink} from './index.js'

const main = async () => {
  await generateCacheAndShortLink()

  const intervalObj = setInterval(async () => {
    await generateCacheAndShortLink()
  }, 0.5*60*1000)
  // clearInterval(intervalObj)
}

main()
