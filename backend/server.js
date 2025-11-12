import express  from 'express'
import redis from './redis.js'
import path from 'path';
import { fileURLToPath } from 'url';

const app = express()
const port = 3000

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const signInHTMLPath = path.join(__dirname, "../src/Pages", "signin.html");
const mainAppPath = path.join(__dirname, "../src/Pages", "homepage.html");
const logInHTMLPath = path.join(__dirname, "../src/Pages", "login.html");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../src')));

redis.connect().catch(console.error);

app.get("/", (req, res) => {
  res.sendFile(signInHTMLPath);
});

app.get("/signin", (req, res) => {
    res.sendFile(signInHTMLPath);
});
//this is where the users will be entering their info to sign up and the data will be sent over to the 
//database
app.post("/signin", async (req, res) => {
    const { name, email, password } = req.body;
    console.log('recieved data', req.body);

    try {
        const userId = await redis.get(`email:${email}`);
        if (userId) {
            res.status(400).send("E-mail already registered. Try logging in.");
        }

        const uniqueId = Date.now().toString();

        await redis.hSet(`user:${uniqueId}`, {
            id: String(uniqueId),
            name: String(name),
            email: String(email),
            password: String(password)
        });
    
        await redis.set(`email:${email}`, uniqueId);
    
        res.redirect('/mainpage');
        
    } catch(error) {
        console.error('Full error details:', error);
        console.error('Error message:', error.message);
        res.status(500).send('Error creating account');
      
    }
});


app.get("/login", (req, res) => {
    res.sendFile(logInHTMLPath);
});

//this is here as placeholder for when we have the login form page that will 
//check information that users enter  
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    const userId = await redis.get(`email:${email}`);

    const user = await redis.hGetAll(`user:${userId}`);

    if (user.password !== password){
        return res.status(401).send("Invalid credentials.")
    }
    res.redirect("/mainpage");

});

//this is where users will be and it will be where they can enter the room code
//to begin the implementation of socket.io and join a room.
app.get("/mainpage", (req, res) => {
  res.sendFile(mainAppPath, (err) => {
    if (err) {
      console.error("Error sending page", err);
      res.status(500).send("Error loading page");
    }
  });
});



app.listen(port, () => {
    console.log(`Example app listening on port ${3000}`)
})
