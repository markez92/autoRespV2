// index.js
require('dotenv').config();
const { handleNewMail, connect } = require('./imapClient');
handleNewMail();

const { manualAnswer } = require('./puppeteerBrowser');
const { notifyAnswerPublished } = require('./imperatoolApi');

const puppeteerBrowser = require('./puppeteerBrowser');
const imperatoolApi = require('./imperatoolApi');

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());
app.listen(port, () => console.log(`Listening at http://localhost:${port}`));

app.post('/manualAnswer', (req, res) => {
    
    const { answerID, answerText, url } = req.body;

    manualAnswer(answerText, url)
    .then(result=>{
        console.log('Respuesta manual publicada correctamente:', answerText);
        notifyAnswerPublished(answerID);
    })
    .catch(error=>{
        console.error('Error al responder manualmente:', error);
    })

    res.sendStatus(200);

});

// Nuevo Endpoint para gestionar las reviews mediante respondLink
app.post('/processReviews', async (req, res) => {
    const respondLinks = req.body.respondLink;

    if (!Array.isArray(respondLinks)) {
        return res.status(400).json({ error: 'respondLink debe ser un array de URLs.' });
    }

    for (const link of respondLinks) {
        try {
            const match = link.match(/https:\/\/business\.google\.com\/n\/(\d+)\/reviews\/[A-Za-z0-9\-_]+/);
            if (match) {
                const businessID = match[1];
                const respondLink = link;
                console.log(`Procesando review para businessID: ${businessID}, link: ${respondLink}`);

                /*const answerOptions = await imperatoolApi.subActiva(businessID);
                if (!answerOptions) {
                    console.log(`La cuenta con businessID ${businessID} no está activa o no gestionada.`);
                    continue;
                }*/
                const answerOptions = true

                await puppeteerBrowser.answerReview(respondLink, businessID, answerOptions)
                .catch(error=>{
                    console.error('Error al responder rw:', error);
                });

                console.log(`Reseña procesada para link: ${respondLink}`);
            } else {
                console.error(`Link no válido: ${link}`);
            }
        } catch (error) {
            console.error(`Error procesando el link ${link}:`, error);
        }
    }

    res.status(200).json({ status: 'Reviews procesadas correctamente.' });
});

// test();

//Handle uncaught exceptions
process.on('uncaughtException', function(error) {
    console.log("Uncaught error: ", error);
});
