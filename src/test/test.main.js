async function testImap(){

    require('dotenv').config();
    const client = require('../imapClient');
    const connection = await client.connect();

    console.log("Connected")

    await connection.openBox('INBOX');

    console.log("InBox opened")

    connection.on('mail', async (numNewMail) => {
        console.log("Email event")
    });

}

(()=>{
    testImap();
})()