import express from 'express'
import redis from './redis.js'

const app = express()
const port = 3000

// Connect to Redis before starting the server
await redis.connect();
console.log('Connected to Redis');

app.get('/', (req, res) => {
    res.send('Hi Perla')
})
  
app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
