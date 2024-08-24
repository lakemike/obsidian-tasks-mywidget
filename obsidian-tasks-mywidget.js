// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: purple; icon-glyph: tasks;
// version 24.8.2024
// author u/mseewald
// forked from https://github.com/TheVamp/obsidian-scriptable-notification

// ------------ *** CONFIGURATION *** ------------

// defaults if not user input
const defaultParameter="myvault||tasks||#mytest||#ignoreme";
// user configuration
const params = (args.widgetParameter ? args.widgetParameter : defaultParameter).split("||"); 
const paramBookmark = params[0]; // Scriptable bookmark to folder
console.log("paramBookmark: " + paramBookmark)
const paramMode = params[1] ? (params[1]).toUpperCase() : "TASKS"; 
console.log("paramMode: " + paramMode)
const paramTaskIdentifier = params[2]; // filter tasks by #tags
console.log("paramTaskIdentifier: " + paramTaskIdentifier)
const paramIgnoreRegex = params[3] ? params[3] : "#ignoreme"; 
console.log("paramIgnoreRegex: " + paramIgnoreRegex)
console.log("")

const limitFutureStart = -14;  // delta days defining future (grey color)
const limitTooFarOut = -90;  // delta days defining too far out (not shown))
const limitDueSoon = -14;  // delta days defining due soon (blue color)
const refreshRateInSeconds = 300;
const LineBreaks = "\n" // relevant for reading .md files
const ignore_files = [".git",".gitignore",".obsidian",".trash"] //if file contains these strings
const search_task = ["- [ ] ","- [/] "] // ignore finished items

const WIDGET_FONTS = {
    small: { WIDGET_TITLE: 18, WIDGET_DESCRIPTION: 14, rowOutput: 5  },
    medium: { WIDGET_TITLE: 20, WIDGET_DESCRIPTION: 14, rowOutput: 5  },
    large: { WIDGET_TITLE: 18, WIDGET_DESCRIPTION: 16, rowOutput: 14 },
    extraLarge: { WIDGET_TITLE: 24, WIDGET_DESCRIPTION: 16, rowOutput: 12 },
    default: { WIDGET_TITLE: 18, WIDGET_DESCRIPTION: 16, rowOutput: 14 }
}
const colorWidgetBackground = "#f5eeb8";
const colorOverdue = "#FF0000";
const colorDueSoon = "#0000FF";
const colorHighestPrio = "#000000";
const colorHighPrio = "#000000";
const colorMediumPrio = "#000000";
const colorFutureStart = "#808080";
const colorAlreadyStarted = "#808080";
const colorLowPrio = "#808080";
const colorLowestPrio = "#808080";

function checkSetup(){
    if(fm.bookmarkExists(paramBookmark)){
        return obsi_root = fm.bookmarkedPath(paramBookmark)
    }else{
        console.error("Did not find Scriptable bookmark: " + paramBookmark)
        Script.complete()
    }
}

const fm = FileManager.local();
let path_root = checkSetup();

function makeArray(item){
    if(typeof item == "string"){
        item = [item]
    }else if(! Array.isArray(item)){
        console.error("Unknown item type: " + typeof item + " - " + item)
        Script.complete()
    }
    return item
}

function filter_in_array(array, pattern_list){
    //keep items when pattern found
    pattern_list = makeArray(pattern_list)
    return array.filter(element => 
        pattern_list.some(pattern => element.includes(pattern))
    );
}

function filter_not_in_array(array, pattern) {
    // Create a regular expression object from the pattern string
    const regex = new RegExp(pattern);
    
    // Filter the array and remove elements that match the pattern
    return array.filter(item => !regex.test(item));
}


function getTasks(file){
    if(file.endsWith(".md")){

        let data = fm.read(file).toRawString()
        let items = data.split(LineBreaks)

        // just keep relevant items
        // finished item not needed, cause it has - [x]
        items = filter_in_array(items, search_task)
        // items = filter_in_array(items, search_date)
        if(paramTaskIdentifier.length > 0){
            items = filter_in_array(items, paramTaskIdentifier)
        }
        if(paramIgnoreRegex.length > 0){
            items = filter_not_in_array(items, paramIgnoreRegex)
        }

        return items
    }else{
        // console.log("skip non MD File: " + file)
        return []
    }
}

function deltaDueDate(task) {
    const datePattern = /📅 (\d{4}-\d{2}-\d{2})/; // Regex to find date
    const match = task.match(datePattern);
    if (match) {
        const dueDate = new Date(match[1]); // Convert the date string to a Date object
        const currentDate = new Date(); // Get today's date
        // Calculate the difference in days
        const diff = (currentDate - dueDate) / (1000 * 60 * 60 * 24);
        const isOverdue = diff > 1;
        // console.log(`Task: ${task}, DueDate: ${dueDate.toISOString()}, IsOverdue: ${isOverdue}, diff: ${diff}`);
        return diff;
    }
    return false; // Return false if no date is found or it's not overdue
}

function deltaStartDate(task) {
    const datePattern = /🛫 (\d{4}-\d{2}-\d{2})/; // Regex to find date
    const match = task.match(datePattern);
    if (match) {
        const startDate = new Date(match[1]); // Convert the date string to a Date object
        const currentDate = new Date(); // Get today's date
        // Calculate the difference in days
        const diff = (currentDate - startDate) / (1000 * 60 * 60 * 24);
        const isInFuture = diff < 1;
        // console.log(`Task: ${task}, StartDate: ${startDate.toISOString()}, isInFuture: ${isInFuture}, diff: ${diff}`);
        return diff;
    }
    return false; // Return false if no date is found or it's not overdue
}



async function displayTasks(widget) {
    let task_count = 0
    let files = [path_root]
    let allTasks = [];

    while (files.length > 0) {
        let item = files.pop()

        if (fm.isDirectory(item)) {
            let list_files = fm.listContents(item)

            //Filter .git + .obsidian + .trash files
            list_files = filter_not_in_array(list_files, ignore_files)

            //merge files with path
            list_files = list_files.map(i => item + "/" + i)
            files.push.apply(files, list_files)

        }else if(fm.fileExists(item)){
            let tasks = getTasks(item)
            if (tasks && tasks.length > 0) {
                // Store each task along with its originating file path
                tasks.forEach(task => {
                    allTasks.push({ task, item });
                });
            }
        }else{
            console.error("Shouldnt be happen on " + item)
        }
    }

    let taskCategories = allTasks.reduce((acc, { task, item }) => {
        if (deltaDueDate(task)>0) {  // positive = overdue
            acc.overdueTasks.push({ task, item });
        } else if (deltaStartDate(task)<limitTooFarOut) {
            // skip these
        } else if (deltaStartDate(task)<limitFutureStart) {
            acc.FutureTasks.push({ task, item });
        } else if (task.includes("🔺")) {
            acc.p1Tasks.push({ task, item });
        } else if (task.includes("⏫")) {
            acc.p2Tasks.push({ task, item });
        } else if (task.includes("🔼")) {
            acc.p3Tasks.push({ task, item });
        } else if (task.includes("🔽")) {
            acc.p_1Tasks.push({ task, item });
        } else if (task.includes("⏬")) {
            acc.p_2Tasks.push({ task, item });
        } else if (task.includes("📅")) {
            acc.DueDateTasks.push({ task, item });
        } else {
            acc.otherTasks.push({ task, item });
        }
        return acc;
    }, { overdueTasks: [], p1Tasks: [], p2Tasks: [], p3Tasks: [], DueDateTasks: [], otherTasks: [], p_1Tasks: [], p_2Tasks: [], FutureTasks: [] });
                
    let sortedTasks = [
        ...taskCategories.overdueTasks, 
        ...taskCategories.p1Tasks, 
        ...taskCategories.p2Tasks, 
        ...taskCategories.p3Tasks, 
        ...taskCategories.DueDateTasks,
        ...taskCategories.otherTasks,
        ...taskCategories.p_1Tasks,
        ...taskCategories.p_2Tasks,
        ...taskCategories.FutureTasks,
    ];

    sortedTasks.forEach(({ task, item }) => {
        if (typeof task === 'string') {  // Safety check to ensure task is a valid string
            let pos_task = search_task.findIndex(pattern => task.includes(pattern));
            let item_splitter = item.split("/");
            let note_title = item_splitter[path_root.split("/").length];
            let note_file = item_splitter[item_splitter.length - 1];
            if (note_title == note_file) {
                note_title = "Root";
            }
            note_title += "/" + note_file;

            let body = task.substring(pos_task + 6)
                .replace(paramTaskIdentifier + " ", "") // at the beginning..
                .replace(" " + paramTaskIdentifier, "") // ..elsewhere
                .replace(/\(\s*https?:\/\/[^\s)]+\s*\)/g, "()")
                .replace(/ ➕ \d{4}-\d{2}-\d{2}/g, "");
            addItem(widget, { "basename": body, "path": note_title });
            // console.log("Item added: " + body + "// path: " + note_title);
        }
    });
}

async function createWidget() {
	let widget = new ListWidget();
	widget.backgroundColor = new Color(colorWidgetBackground);
	widget.spacing=-2;
	widget.refreshAfterDate = new Date(Date.now() + 1000 * refreshRateInSeconds);

   const titleStack = widget.addStack();
   titleStack.setPadding(10, 0, 10, 0);
   let titleText = "";
   
   if(paramMode==="TASKS") titleText = "Tasks " + paramTaskIdentifier;
   const widgetTitleText = titleStack.addText( "Obsidian: " + titleText );
   widgetTitleText.font = Font.boldSystemFont(getWidgetFont('WIDGET_TITLE'));
   widgetTitleText.textColor = Color.black();
    	
  	if( !fm.bookmarkExists(paramBookmark) ) {
	  	errorMessage(widget, "The Scriptable bookmark does not exist for your Obsidian vault. Open settings in Scriptable and create a Bookmark to the root folder of your vault.");
	} else {  
		if(paramMode==="TASKS")
			await displayTasks(widget);
	}
	 widget.addSpacer();
    return widget;
}

async function addItem(widget, doc, uriType="open") {
  	//exmaple doc: {"basename":"2021-08-24","path":"f/DNP/2021-08-24.md"}
    let row = widget.addStack();
    const dot = row.addText( "◻︎ "  );
    dot.font = Font.lightSystemFont(getWidgetFont('WIDGET_DESCRIPTION'));
    dot.textColor = Color.black();
    const fileName = row.addText( doc.basename );
    fileName.font = Font.lightSystemFont(getWidgetFont('WIDGET_DESCRIPTION'));
    if (deltaDueDate(doc.basename)>0) { // positive = overdue
        fileName.textColor = new Color(colorOverdue);
    } else if (doc.basename.includes("📅") && deltaDueDate(doc.basename)>limitDueSoon) { // due soon
        fileName.textColor = new Color(colorDueSoon);
    } else if (deltaStartDate(doc.basename)<limitFutureStart) {
        fileName.textColor = new Color(colorFutureStart);
    } else if (doc.basename.includes("⏳")) {
        fileName.textColor = new Color(colorAlreadyStarted);
    } else if (doc.basename.includes("🔺")) {
        fileName.textColor = new Color(colorHighestPrio);
        fileName.font = Font.boldSystemFont(getWidgetFont('WIDGET_DESCRIPTION'));
    } else if (doc.basename.includes("⏫")) {
      fileName.textColor = new Color(colorHighPrio);
    } else if (doc.basename.includes("🔼")) {
      fileName.textColor = new Color(colorMediumPrio);
        } else if (doc.basename.includes("🔽")) {
      fileName.textColor = new Color(colorLowPrio);
            } else if (doc.basename.includes("⏬")) {
      fileName.textColor = new Color(colorLowestPrio);
    } else {
        fileName.textColor = Color.black();
    }

    row.addSpacer();

    if (!config.runsWithSiri) {
		const encodedPath = encodeURIComponent(doc.path);
		if(uriType==="search")
			row.url = `obsidian://search?vault=${encodeURIComponent(paramBookmark)}&query=${encodedPath}`;
		else //default is for uri type open
			row.url = `obsidian://open?vault=${encodeURIComponent(paramBookmark)}&file=${encodedPath}`;
    }
}

function getWidgetFont(key) {
    return WIDGET_FONTS[config.widgetFamily] ? WIDGET_FONTS[config.widgetFamily][key] : WIDGET_FONTS.default[key];
}

const widget = await createWidget()

if (config.runsInWidget) {
    Script.setWidget(widget);
} else {
    //widget.presentMedium();
    widget.presentLarge();
    //widget.presentExtraLarge();
}
Script.complete()
