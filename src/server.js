// import express from 'express'
// import morgan from 'morgan'
// import http from 'http'

import {generateCacheAndShortLink} from './index.js'

// const env = process.env.NODE_ENV || 'development'

// const app = express()
// const server = http.Server(app)

// // LOG
// if (app.get('env') === 'development') app.use(morgan('dev'))

// // error handler
// app.use((err, req, res, next) => {
//   res.status(err.status || 500)
//   res.render('error', {
//     message: err.message,
//     error: app.get('env') === 'development' ? err : {},
//   })
// })

// const listener = server.listen(process.env.PORT || 8080, async () => {
//   console.log('Listening on port ' + listener.address().port)
// })
const main = async () => {
  await generateCacheAndShortLink()

  const intervalObj = setInterval(async () => {
    await generateCacheAndShortLink()
  }, 2*60*1000)
  // clearInterval(intervalObj)
}

main()
