import type {Task} from "./task.js"

export function ProcessTask(task: Task) : void {

  if(!task.payload){
    throw new Error("Payload is empty") 
  }

    switch (task.type) {
  case "send_email":
    console.log("Sending Email to", task.payload["to"], "with subject",task.payload["subject"]);
    break;
  case "resize_image":
    console.log("Image Resizing to x:", task.payload["new_x"], "y:",task.payload["new_y"]);
    break;
  case "generate_pdf":
    console.log("PDF Generating");
    break;
    case "":
    throw new Error("Error:Task Cant be empty");
  default:
    throw new Error("UnSupported Task:" + task.type);
}
}