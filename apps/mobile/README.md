>  **Warning:** This project cannot be used with an Expo Go app because it requires custom native code.


# Vapi React Native Integration with expo build Starter Template

This starter template is designed to help you quickly integrate Vapi into your react native project. It showcases a bot that assists authors in defining characters for their stories, demonstrating the ease of integrating Vapi to manipulate the frontend, display backend results, and leverage other capabilities.

## Features

- **Real-time Interaction**: Interact with the bot in real-time to refine character traits and details.
- **Message Handling**: Send and receive messages to and from the bot, handling different message types.
- **Event Handling**: Start, stop, and toggle bot calls with proper event management.

## Getting Started

1. Clone the repository.
2. Install dependencies with `npm install`.
3. prepare expo build `npx expo prebuild`
4. Install iOS pods with `npx pod-install`
5. Set up your `.env` file with the required Vapi tokens.
6. Run the local server with `npx expo run:ios`.

## Integration Points

- **Vapi SDK**: Integrated via `vapi.sdk.ts` to manage the Vapi instance.
- **React Hooks**: `useVapi.ts` to encapsulate Vapi logic within React components.
- **Event Listeners**: Set up listeners for various Vapi events like speech start/end, call start/end, and message updates.
- **Message Components**: Render messages and transcripts in real-time as they are received from the bot.
- **Character Details**: Edit and save character details, which are then sent as messages to the bot for processing.


## To add Vapi to your existing react native expo project


3. update your current existing dependencies in package.json to the exact version as showing below
```
"expo": "^50",
"react-native": "^0.73.6",
```

2. Add new dependencies to your package.json with exact version as showing below
```
"@vapi-ai/react-native": "^0.1.6",
"@config-plugins/react-native-webrtc": "8.0.0",
"@daily-co/config-plugin-rn-daily-js": "0.0.4",
"@daily-co/react-native-daily-js": "0.59.0",
"@daily-co/react-native-webrtc": "118.0.3-daily.1",
"@react-native-async-storage/async-storage": "^1.22.3",
"react-native-background-timer": "^2.4.1",
"react-native-get-random-values": "^1.11.0",
```

3. Update app.json


```
{
    "expo": {

        ...

        "ios": {
        "supportsTablet": true,
        "bundleIdentifier": "co.vapi.DailyPlayground",
        "infoPlist": {
            "UIBackgroundModes": [
            "voip"
            ]
        },
        "bitcode": false
        }

    ...

  }

    ...

    "plugins": [
        "@config-plugins/react-native-webrtc",
        "@daily-co/config-plugin-rn-daily-js",
        [
        "expo-build-properties",
        {
            "android": {
                "minSdkVersion": 24
            },
            "ios": {
                "deploymentTarget": "13.4"
            }
        }
        ]
    ]
}
```
4. prepare expo build `npx expo prebuild`

5. Install iOS pods with `npx pod-install`

6. Set up your `.env` file with the required Vapi tokens.

7. Run the local server with `npx expo run:ios`.

