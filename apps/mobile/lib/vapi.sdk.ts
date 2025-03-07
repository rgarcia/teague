//import Vapi from "@vapi-ai/react-native";
import Vapi from "./vapi/vapi";

console.log("VAPI API KEY", process.env.EXPO_PUBLIC_VAPI_API_KEY);
const vapi = new Vapi(process.env.EXPO_PUBLIC_VAPI_API_KEY!);

export default vapi;
