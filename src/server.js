import {start} from './index.js'

const main = async () => {
  await start()

  const intervalObj = setInterval(async () => {
    await start()
  }, 0.5*60*1000)
  // clearInterval(intervalObj)
}

main()
