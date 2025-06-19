const Openai = require('openai');
Openai.apiKey = process.env.OPENAI_API_KEY;

const getOpenAIResponse = async (reviewInfo, config) => {

	const chatBot = new Openai();

	const businessName = reviewInfo.profile.name;
	const publisherName = reviewInfo.publisher.name;
	const { text: reviewText, rating } = reviewInfo.rw;

	/*profileConfigAI = {
        tone: String,
        useName: bool,
        defend: bool,
        emojis: bool
    }*/

	const tone = config.tone || 'informal';
	const useName = config.useName ? `de ${publisherName}` : '';
	const defend = config.defend ? ', defendiendo partes negativas si existen' : '';

	let contentSystemPrompt = `Dueño de ${businessName} das respuesta a una reseña ${useName} que ha puntuado ${rating} sobre 5 estrellas utilizando, si la reseña es larga, el contenido dentro de tu respuesta de agradecimiento. Tu respuesta será ${tone}, corta ${defend}. Si la reseña es corta solo agradécela. No utilices paréntesis con placeholders como [Nombre]. Tu respuesta debe ser humana.`;

	if (!config.emojis) contentSystemPrompt += ' No utilices emojis.';

	const data = {
		messages: [
			{ role: 'system', content: contentSystemPrompt },
			{ role: 'user', content: reviewText? reviewText : 'Reseña sin texto, solo valoración en estrellas.'},
		],
	};

	try {

		const response = await chatBot.chat.completions.create({
			model: 'chatgpt-4o-latest',
			messages: data.messages,
		});

		const aiResponse = response.choices[0].message.content;
		return aiResponse; // Devuelve la respuesta directamente

	} catch (error) {
		console.error('Error al llamar a la API de OpenAI:', error);
		throw error; // Lanza el error para manejarlo más arriba en la cadena de promesas
	}
};

module.exports = {
	getOpenAIResponse,
};
