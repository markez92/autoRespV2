# How to execute
## 1. Stop and remove container
`sudo docker ps`  
`sudo docker remove -f {containerID}`
  
## 2. Redo image with new code
`sudo docker image ls`  
`sudo docker rmi autoresp:beta`  
`sudo docker build -t autoresp:beta .`  
  
## 3. Create and run new container
`sudo docker run -d --name autoresp --env-file .env --cap-add=SYS_ADMIN --add-host=host.docker.internal:host-gateway --memory 2g --memory-swap 2g  --cpus 1 --network mi_red autoresp:beta`
  
## 4. Check logs
`sudo docker logs -f autoresp`
