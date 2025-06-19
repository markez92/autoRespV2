const puppeteer = require('puppeteer');
const imperatoolApi = require('./imperatoolApi');
const openaiChat = require('./openaiChat');
const fs = require('fs-extra');
const path = require('path');

// Función para inicializar el navegador y la página
async function initializeBrowser(url) {

	const originalUserDataDir = 'browserProfile';

	// Crea un nuevo directorio para cada inicialización del navegador
	const userDataDir = `${originalUserDataDir}-${Date.now()}`;
	const fullUserDataDir = path.join(process.cwd(), userDataDir);

	// Añade la configuración del proxy a las opciones de lanzamiento, si se proporciona
    const launchOptions = {
        headless: false, //'new' Asegúrate de que este valor sea booleano (true o false) o ajusta según sea necesario
        userDataDir: fullUserDataDir,
        args: ['--no-sandbox', '--disable-setuid-sandbox','--proxy-server=5.157.52.79:12345'] // Añade el proxy aquí
    };

    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    await page.authenticate({
        username: 'imperatool',
        password: 'webtools12'
      });

	await page.goto(url, { waitUntil: 'networkidle0' });

	// Si se redirige a iniciar sesión -> iniciar sesión
	console.log('Url a la que quiero navegar: ' + url);
	if (page.url().includes('signin')) {
		await realizarLogin(page);
		// Después de iniciar sesión, regresa a la página de navegación
		await page.goto(url, { waitUntil: 'networkidle0' });
	}

	console.log('Navegando a url: ' + url);
	return { browser, page, userDataDir: fullUserDataDir };

}

// Función para cerrar el navegador y limpiar el directorio de perfil de usuario
async function closeBrowser(browser, userDataDir) {

	await browser.close();

	// Limpia el directorio de perfil de usuario copiado
	await fs.remove(userDataDir);

}

async function _getReviewInfo(puppeteerBrowser, businessID) {

    const { page } = puppeteerBrowser;

    //Get review id
    const urlNow = page.url();
    const matchPid = urlNow.match(/Ch[A-Za-z0-9\-_]+/);
    const pid = matchPid ? matchPid[0] : null;

    //Get answer url and navigate to it
    const completeURL = `https://www.google.com/local/business/${businessID}/customers/reviews/reply?knm=0&ih=lu&origin=https%3A%2F%2Fwww.google.com&hl=es&reviewId=${pid}`;

    await page.goto(completeURL, { waitUntil: 'networkidle0' });

    //Wait for review to load
    await page.waitForSelector('[aria-label="Revisar"]', { visible: true });

    //Get data from script
    const scripts = await page.evaluate(() => {
        return Array.from(document.getElementsByTagName('script')).map(script=>script.innerHTML)
    })
    
    //Identify script with review data
    let scriptData;
    for(let el of scripts) if(el.includes("AF_initDataCallback({key: 'ds:0'")){
        scriptData = el;
        break;
    }

    if(!scriptData) throw new Error('Could not get review data from page');

    //Parse data
    let startIndex = scriptData.indexOf('[');
    let endIndex = scriptData.lastIndexOf(']');
    let scriptArray = scriptData.substring(startIndex, endIndex + 1);

    const parsed = eval(scriptArray)[0];

    const reviewInfo = {
        
        rw:{
            id: parsed[0],
            text: parsed[5],
            date: parsed[8],
            rating: parsed[19],
            report_url : parsed[21],
            rw_url: parsed[35],
            reply_url: completeURL
        },
        profile:{
            name: parsed[30][0],
            img: parsed[30][1]
        },
        publisher:{
            id: parsed[32][0],
            name: parsed[32][1],
            url: parsed[32][2],
            img: parsed[32][3],
            contrib: parsed[32][4],
            lg: parsed[32][7]
        }

    }    

    return reviewInfo;

}


async function _publishAnswer(puppeteerBrowser, aiResponse) {

    const { page } = puppeteerBrowser;

    //Type answer
    const textArea = await page.$('#i4');
    await textArea.type(aiResponse);

    //Click send
    await page.evaluate(() => {

        //Identify send button
        const buttons = Array.from(document.querySelectorAll('button'));
        const sendButton = buttons.find(
            button => button.textContent === 'Responder'
        );

        if(sendButton) sendButton.click();
        else throw new Error('Could not find send button');
        
    });

}


//Go to answer review page, get review send to GPT4 for respond and type & send it
const answerReview = async (url, businessID, options) => {
        
    //Initialize browser
    const puppeteerBrowser = await initializeBrowser(url);

    //Get rw info
    const reviewInfo = await _getReviewInfo(puppeteerBrowser, businessID)
    .catch(error=>{
        console.error('Error al obtener la información de la reseña:', error);
        closeBrowser(puppeteerBrowser.browser, puppeteerBrowser.userDataDir);
    })

    console.log("RW info: ", reviewInfo);
    if(!reviewInfo) return;

    //Check if we already answered
    const rwAnswered = await imperatoolApi.checkRwAnswered(reviewInfo.rw?.id)
    .catch(error=>{
        console.error('Error al comprobar si la reseña ya ha sido respondida:', error);
        closeBrowser(puppeteerBrowser.browser, puppeteerBrowser.userDataDir);
    })
    if(rwAnswered !== false) return;

    //Get answer from GPT4
    const aiResponse = await openaiChat.getOpenAIResponse(reviewInfo, options)
    .catch(error=>{
        console.error('Error al obtener la respuesta de GPT4:', error);
        closeBrowser(puppeteerBrowser.browser, puppeteerBrowser.userDataDir);
    })
    
    reviewInfo.answerText = aiResponse;

    console.log('AI Response :', aiResponse);
    if(!aiResponse) return;
    
    //Publish answer
    if(
        (reviewInfo.rw?.rating < 4 && options.auto_negative) //Negative reviews
        || (reviewInfo.rw?.rating >= 4 && options.auto) //Positive reviews
    ){

        await _publishAnswer(puppeteerBrowser, aiResponse)
        .then( () => reviewInfo.published = true )
        .catch(error=>{
            console.error('Error al publicar la respuesta:', error);
            closeBrowser(puppeteerBrowser.browser, puppeteerBrowser.userDataDir);
        })

    }

    //TODO: await verificacion navegador de que se ha dado respuesta
    //await page.waitForTimeout(2000000);

    await closeBrowser(puppeteerBrowser.browser, puppeteerBrowser.userDataDir);

    //Inform impeBack
    await imperatoolApi.enviarReviewConRespuesta(reviewInfo, businessID);

};

// Función para navegar a una URL y aceptar una invitación
const acceptGMBInvitation = async (url, profileID) => {
	let browser, page, userDataDir;
	try {

		({ browser, page, userDataDir } = await initializeBrowser(url));

		await page.waitForTimeout(10000);

		await page.evaluate(() => {

			const selector = 'div[role="button"]';
			const buttonExists = document.querySelector(selector);
			if (!buttonExists) throw("No hay boton de aceptar inv")

			let buttons = [...document.querySelectorAll(selector)];
			let acceptButton = buttons.find(button => button.textContent.includes('Aceptar'));

			if (acceptButton) acceptButton.click();
			else throw('El botón Aceptar no se encontró');

		});

		await page.waitForTimeout(5000);

		//Si redireccion al buscador de la empresa exito informamos
		if (page.url().includes('google.com/search'))
			await imperatoolApi.confirmaAceptacionGestionGMB(profileID);

        else throw("Error no redireccion despues de aceptar. No notificado a IT")

		await closeBrowser(browser, userDataDir);

	} catch (error) {
		console.error('Se produjo un error:', error);
		if (browser) {
			await closeBrowser(browser, userDataDir);
		}
	}
};

async function handleCaptcha(page) {
    const Captcha = require("2captcha-ts");
    const solver = new Captcha.Solver("077798c64a2e77a12f1c95c5d436f380");

    const isCaptchaPresent = await page.evaluate(() => {
        const captcha = document.querySelector('#captchaimg');
        return captcha !== null;
    });

    if (isCaptchaPresent) {
        console.log('Captcha detected. Solving captcha...');

        //Capturamos la imagen del captcha
        const captchaImageBase64 = await page.evaluate(() => {
            const captchaImage = document.querySelector('#captchaimg');
            return fetch(captchaImage.src)
                .then(response => response.blob())
                .then(blob => new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                }));
        });

        try {
            const res = await solver.imageCaptcha({
                body: captchaImageBase64,
                numeric: 4,
                min_len: 5,
                max_len: 5
            });
            console.log('Captcha solved:', res);

            //Ingresamos la solucion del captcha
            await page.evaluate((solution) => {
                document.querySelector('[name="ca"]').value = solution.data;
                document.querySelector('#identifierNext').click();
            }, res);

            await page.waitForTimeout(5000);

            //Esperamos identificador password si no esta recursivo
            const isPasswordPresent = await page.evaluate(() => {
                const passwordField = document.querySelector('#password');
                return passwordField !== null;
            });
            if (!isPasswordPresent) {
                console.log('Password field not found. Calling realizarLogin again...');
                await handleCaptcha(page);
            }
            // await page.waitForTimeout(5000000);

        } catch (err) {
            console.error('Error solving captcha:', err.message);
        }
    }
}

//Realiza Login Google //Info: Puede saltar captcha TODO: Robustez. Si captcha->cambia ip->intenta otra
async function realizarLogin(page) {
	try {
		console.log('Login...');

		await page.type('#identifierId', 'GestorAI@auto.imperatool.com');
		await page.click('#identifierNext');

		await page.waitForTimeout(3000);
        // Call to handleCaptcha function
        try {
             const captchaDetected = await handleCaptcha(page);
            if (captchaDetected) console.log('ha saltado captcha');
            await page.waitForTimeout(5000);
        } catch (error) {
            console.error('Error handling captcha:', error);
        }
        //await page.waitForTimeout(20000000);
		await page.type('#password', process.env.IMAP_PASSWORD);

		await Promise.all([page.waitForNavigation(), page.click('#passwordNext')]);

        await page.waitForTimeout(10000);

		await page.goto('https://myaccount.google.com/', { waitUntil: 'networkidle0' });

        await page.waitForTimeout(5000);

        console.log('Login completado');
	} catch (error) {
		console.error('Error al realizar el login:', error);
	}
}


module.exports = {
    answerReview,
	acceptGMBInvitation,
};


module.exports.manualAnswer = async function(answerText, url) {

    //Initialize browser
    const puppeteerBrowser = await initializeBrowser(url);

    const { page } = puppeteerBrowser;

    try{

        //Open url
        await page.goto(url, { waitUntil: 'networkidle0' });
    
        //Wait for review to load
        await page.waitForSelector('[aria-label="Revisar"]', { visible: true });
    
        //Publish answer
        await _publishAnswer(puppeteerBrowser, answerText)

        console.log('Respuesta publicada con éxito');

        closeBrowser(puppeteerBrowser.browser, puppeteerBrowser.userDataDir);

    }catch(error){
        console.error('Error al publicar la respuesta:', error);
        closeBrowser(puppeteerBrowser.browser, puppeteerBrowser.userDataDir);
    }

}