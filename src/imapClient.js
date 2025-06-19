const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const puppeteerBrowser = require('./puppeteerBrowser');
const _ = require('lodash'); // Asegúrate de que lodash está instalado

const imperatoolApi = require('./imperatoolApi');
const googleApi = require('./apis/google.api');

const buildXOAuth2Token = (user, accessToken) => {
    return Buffer.from(
      `user=${user}\x01auth=Bearer ${accessToken}\x01\x01`,
      'utf-8'
    ).toString('base64');
};

let config = {
    imap: {
        user: 'autoresp.imperatool@gmail.com',
        // password: process.env.IMAP_PASSWORD,
        xoauth2: null,//Filled on connect
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }
    }
};

async function connect(n=1) {

    const googleToken = await googleApi.getAccessToken();

    config.imap.xoauth2 = buildXOAuth2Token('autoresp.imperatool@gmail.com', googleToken);

    return await imaps.connect(config)
    .catch(async (err) => {
        console.log(`Error al conectar con imap. Intento ${n}`);
        if(n>=5) throw err;
        else{
            console.log('Esperando 1 minuto para la reconexión.')
            await new Promise(resolve => setTimeout(resolve, 60000));
            return await connect(n+1);
        }
    });

}

async function handleNewMail() {

    let connection = await connect()
    .catch((err) => {
        console.error('Imposible conectar imap', err);
        imperatoolApi.notifyError('Imposible conectar con el servidor imap. Autoresp detenido, acción necesaria.');
        throw err;
    });

    console.log("Conexión imap establecida.")

    connection.on('error', (err) =>{
        console.log('Error en la conexión imap:', err);
        if(!!connection && connection.prototype === imaps.prototype){
            connection.end();
        }
    });

    connection.on('close', () =>{

        console.log('Conexión imap cerrada.');
        console.log('Reconectando...');
        handleNewMail();

    });

    connection.on('end', () => {
        console.log('Conexión imap terminada.');
    });

    
    await connection.openBox('INBOX');

  // Este evento se dispara cada vez que llega un nuevo correo electrónico.
  connection.on('mail', async (numNewMail) => {
    var searchCriteria = ['UNSEEN'];
    var fetchOptions = { bodies: ['HEADER', 'TEXT'], struct: true, markSeen: true };

    var messages = await connection.search(searchCriteria, fetchOptions);
    let taskList = messages.map(async (message) => {
      var all = _.find(message.parts, { "which": "TEXT" });
      var id = message.attributes.uid;
      var idHeader = "Imap-Id: " + id + "\r\n";
      try {
        let emailBuffer = Buffer.from(idHeader + all.body);
        let parsedEmail = await simpleParser(emailBuffer);
        await processMessage(parsedEmail, id);
      } catch (err) {
        console.error('Error al procesar el correo electrónico:', err);
      }

      // Marcar mensaje para eliminación
    //   await connection.addFlags(id, "\\Deleted");
    });

    await Promise.all(taskList);
    await connection.imap.expunge();
    // No cerrar la conexión aquí, para que pueda seguir escuchando nuevos correos electrónicos
  });
}

async function processMessage(parsed, seqno) {

    //console.log(parsed);
    const emailBody = parsed.textAsHtml;
    if(!emailBody) throw("Error no email body");

    let actionType = null;
    let profileID = null;
    let businessID = null;

    // Eliminado el manejo de 'review'
    
    if (emailBody.includes('invitado') || emailBody.includes('invited')) {

        actionType = 'invitation';

        const match = emailBody.match(/AI\+(\d+)@/);

        if (match) {
            profileID = match[1];
            console.log('profileID: ' + profileID);
        }

        if (!profileID) throw('(#' + seqno + ') No se pudo extraer profileID del correo electrónico.');

    }

    console.log('actionType: ' + actionType);

    switch (actionType) {

      case 'invitation':
        await handleInvitation(parsed, profileID, seqno);
        break;

      default:
        console.log('(#' + seqno + ') No se requiere acción para este mensaje.');
        break;

    }
  
}

async function handleReview(parsedEmail, businessID, seqno) {

    const links = parsedEmail.text.match(/https:\/\/business\.google\.com\/n\/\d+\/reviews\/[A-Za-z0-9\-_]+/g);
    //Remove duplicates
    const uniqueLinks = [...new Set(links)];
    console.log('respondLinks :' + uniqueLinks);

    const answerOptions = await imperatoolApi.subActiva(businessID); //Beta handled by IT
    if(!answerOptions) return;

    console.log('(#' + seqno + ') Respondiendo. Options:', answerOptions);

    for(const respondLink of uniqueLinks) {
        await puppeteerBrowser.answerReview(respondLink, businessID, answerOptions)
        .catch(error=>{
            console.error('Error al responder rw:', error);
        })
        console.log('(#' + seqno + ') Reseña procesada.');
    }    

}

async function handleInvitation(parsedEmail, profileID, seqno) {
  const invitationLink = parsedEmail.text.match(/https:\/\/notifications\.google\.com\/g\/p\/[A-Za-z0-9\-_]+/g)[0];
  console.log('Enlace de invitación: ' + invitationLink);
  console.log('profileID: ' + profileID);
  await puppeteerBrowser.acceptGMBInvitation(invitationLink, profileID);
  console.log('(#' + seqno + ') Invitación procesada.');
}

module.exports = { handleNewMail, connect };
