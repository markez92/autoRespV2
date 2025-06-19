const axios = require('axios').create({
    headers: { 'Authorization': `Bearer ${process.env.IMPE_API_BEARER}` }
})

const it_url = process.env.NODE_ENV === 'DEVELOP' ? process.env.BASE_DEV_API_URL : process.env.BASE_PROD_API_URL;
const baseApiUrl = it_url + '/api/answers/bot';

const imperatoolApi = {};

//Confirma a back gestion del perfil GMB
imperatoolApi.confirmaAceptacionGestionGMB = (profileID) => {

    return axios.post(`${baseApiUrl}/profile/${profileID}/manage`)
    .then((response) => {
        console.log(`La petición para el id ${profileID} se completó con éxito`);
    })
    .catch((error) => {
        console.error(`Error confirmacion a backend de gestion del perfil ${profileID} : ${error}`);
    });

};

//? está gestionado y tienen sub activa
imperatoolApi.subActiva = async (businessID) => {

    return new Promise((resolve, reject) => {

        axios.get(`${baseApiUrl}/profile/${businessID}/is-active`)
        .then((response) => {
            if(response.data.active){
                console.log(`Tenemos gestion y la cuenta sub activa para ${businessID}`);
                resolve(response.data.options);
            }else{
                resolve(false);
            }
        })
        .catch((error) => {
            console.error(`Error al preguntar a back si gestionado y con sub para ${businessID} : ${error}`);
            resolve(false);
        });

    });

}


// Método para enviar review recibida y su respuesta al backend
imperatoolApi.enviarReviewConRespuesta = async (reviewInfo, businessID) => {
    /*
    const reviewInfo = {
        reviewerName: lines[0],
        stats: lines[2],
        rating: (lines[4].match(/star/g) || []).length,
        timePosted: lines[4].split(' ').slice(-3).join(' '),
        reviewContent: lines[5] || '',
        businessName: businessName,
        reviewAnswer : ,
        published: Boolean (RW se ha publicado (true) o solo se ha generado (false))
    };*/

    return axios.post(`${baseApiUrl}/profile/${businessID}/rw-answer`, reviewInfo)
    .then((response) => {
        console.log('Respuesta publicada y rw enviada con éxito');
    })
    .catch((error) => {
        console.error(`Error al enviar la review y la respuesta: ${error}`);
    });

};


module.exports = imperatoolApi;

module.exports.notifyAnswerPublished = async (answerID) => {
    return axios.post(`${baseApiUrl}/answer/${answerID}/published`)
    .then((response) => {
        console.log('Respuesta publicada notificada con éxito');
    })
    .catch((error) => {
        console.error(`Error al notificar la publicación de la respuesta: ${error}`);
    });
}

module.exports.checkRwAnswered = async (rwID) => {

    if(!rwID) return true; //Do not answer

    return axios.get(`${baseApiUrl}/answer/${rwID}/is-answered`)
    .then((response) => {
        return response.data.answered;
    })
    .catch((error) => {
        console.error(`Error al preguntar si rw ${rwID} ha sido respondida: ${error}`);
        return true; //Do not answer
    });
}

module.exports.notifyError = async (message) => {

    return axios.post(`${it_url}/api/admin/aux/notify-email`, {
        message: message,
        service: 'AutoResp Server'
    })
    .then((response) => {
        console.log('Error notificado con éxito');
    })
    .catch((error) => {
        console.error(`Error al notificar el error: ${error}`);
    });

}
