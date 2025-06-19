#Using and official puppeteer image
FROM ghcr.io/puppeteer/puppeteer:21.7.0

# Set the working directory in the container to .
WORKDIR .

# Change back to the pptruser
#USER pptruser

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Change the permissions of the working directory
USER root
RUN chown -R pptruser:pptruser .

# Change back to the pptruser
USER pptruser

# Install the application dependencies
RUN npm install

# Bundle the application source inside the Docker image
COPY . .

# Copy .env file to the working directory in the container
COPY .env ./

# Make port 80 available to the world outside this container
EXPOSE 8086

# Define the command to run the application
CMD [ "npm", "start" ]

