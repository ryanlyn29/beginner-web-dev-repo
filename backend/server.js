import express  from 'express'
import redis from './redis.js'
import path from 'path';
import { fileURLToPath } from 'url';
const app = express()
const port = 3000

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const signInHTMLPath = path.join(__dirname, '../src/auth', 'sign-in.html');
app.use(express.json());

app.listen (async () => {
    await redis.connect();
})

app.get('/', (req, res) => {
    res.sendFile(signInHTMLPath);
  })
  
app.listen(port, () => {
    console.log(`Example app listening on port ${3000}`)
})
