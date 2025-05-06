# Canvas to Notion API
Fetch Canvas Assignments into Notion

## Introduction

This tool fetches assignments from your current Canvas courses and\
populates a specified Notion page with the tables for each course.

## Setup Guide

### 1. Project Setup

#### Clone repo
```zsh
git clone https://github.com/angadv12/canvas-notion-api.git
```

#### Navigate to the repo
```zsh
cd canvas-notion-api
```

#### Install required dependencies
```zsh
npm i
```

### 2. Canvas Token Access

Go to your Canvas Profile Settings and scroll down to `Approved Integrations`.
<img src="img/CanvasIntegrationNAT.png">
    Click on `+ New Access Token` to create the token.

<img src="img/CanvasIntegrationToken.png" width="400">
    Name your Token, and leave the date blank to have no expiration date.

<img src="img/CanvasIntegrationDetails.png" width="400">
    Once the Token is generated, copy the Token string.

This string will be your **Canvas API Key**

### 3. Notion API Key Access

Pull up the [Notion - My Integrations](https://www.notion.so/my-integrations) site and click `+ New Integration`

Enter the name of the integration (ie Canvas Notion Integration) and what workspace the Integration will apply to.
In the `Secrets` tab and copy the _Internal Integration Secret_ this will be your **Notion API Key**.

<img src="/img/NotionIntegration.gif" width="500">

### 4. Create Integration within Notion

Head to whatever Notion Page you want to put the database in and click on `...` in the top right.
Scroll down to `+ Add Connections`. Find and select the integration. Make sure to click confirm.

<img src="/img/NotionPermissions.gif" width="500">

### 5. Environment Variable `.env` file Setup
Create a `.env` file and replace all the <> with your own information. Place the `.env` file in the `src` folder.
*Keep the `NOTION_DATABASE` variable as is because it will be overwritten when you run the code*

```
CANVAS_API_URL=<example: https://canvas-page.edu>
CANVAS_API=<your canvas api token>
NOTION_PAGE=<page id of the parent page to create the database>
NOTION_API=<your notion api key> # filled by user
NOTION_DATABASE='invalid' # filled by integration
```

> [!NOTE]
> How to Access the Key for the `NOTION_PAGE`:
> 1. On the desired Notion page, click `Share` then `🔗 Copy link`
> 2. Paste the link down, example url: notion.so/{name}/{page}-**0123456789abcdefghijklmnopqrstuv**?{otherstuff}
> 3. Copy the string of 32 letter and number combination to the `.env` file

### 6. Run Code

```zsh
cd src
node main.js
```

> [!NOTE]
> To see updates in your Notion tables, you need to rerun the script, which checks for new assignments for each course.

## Other Information

#### Built from: https://github.com/marigarey/canvas-notion-integration

#### Key modifications
1. Bug fixes so assignments are actually fetched
2. Create separate Notion tables for each course
