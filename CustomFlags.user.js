// ==UserScript==
// @name        NetSuite Custom Flags
// @namespace   jhutt.com
// @license     MIT
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/salesord.nl*
// @match       https://1206578.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=6165*
// @require     https://cdn.jsdelivr.net/npm/@violentmonkey/dom@2
// @downloadURL https://raw.githubusercontent.com/Numuruzero/NSCustomFlags/main/CustomFlags.user.js
// @version     0.50
// @description Provides a space for custom flags on orders
// ==/UserScript==


// Determine if the record is in edit mode
// console.log('Determining edit mode');
const edCheck = new RegExp('e=T');
const url = window.location.href;
const isEd = edCheck.test(url);

// Declare custom flag states
const flags = {
  boPresent: false,
  boItems: [],
  discountHigh: false,
  custNoGroms: false,
  hasCustom: false,
  needShipCost: false,
  hasProbSKU: false,
  probSKUs: [],
  freightSKUs: [],
  needsFreight: false,
  isFreight: false,
  shouldFreight: false,
  shouldFSKUs: [],
  hasFreightQs: false,
  isSPOrder: false
};

// New simpler function to capture table data as 2D array
// Does not care if the table is in edit mode or not, but may return empty rows if in edit mode
function captureTableData(tableElement) {
  const rows = tableElement.querySelectorAll("tr");
  const data = [];
  rows.forEach(row => {
    const cols = row.querySelectorAll("td,th");
    const rowData = [];
    cols.forEach(col => {
      rowData.push(col.innerText.trim());
    });
    data.push(rowData);
  });
  return data;
}

// Item row numbers
const itmCol = {
  set: false,
  itmSKU: "ITEM",
  boStatus: (isEd) ? "ESD (USED IN AUTOMATION)" : "STATUS (NOT STORED)", // Notably, these are no longer the same field. ESD will not show transfer status
  numBO: (isEd) ? "BACK ORDERED" : "# BACKORDERED",
  needsFreight: "MUST SHIP FREIGHT?",
  itemType: "ITEM TYPE"
};

// Build an array out of the table
const buildItemTable = () => {
  const itemTable = captureTableData(document.querySelector("#item_splits"));
  // Make sure headers are in uppercase (NS inconsistently uses sentence case)
  itemTable[0] = itemTable[0].map(header => header.toUpperCase().trim());
  if (!itmCol.set) {
    for (key in itmCol) {
      const hdrIndex = itemTable[0].indexOf(itmCol[key]);
      if (hdrIndex != -1) {
        itmCol[key] = hdrIndex;
      } else {
        console.log(`Header ${key} not found`)
      }
      itmCol.set = true;
    }
  }

  const parsedTable = itemTable.map(row => row.map(col => `"${col.replace(/"/gm, '""')}"`));
  // parsedTable.shift(); // Remove header row after column indices are found
  return itemTable; // Not sure if we need to parse out the quotes since we aren't exporting this, though we may want to remove the header row
}

let theTable = []; // We'll push buildItemTable to this

const boESDs = { // Outlier flag using specific variables for additional data
  skus: [],
  noDates: [],
  hasDates: [],
  boItems: [],
  isBO: false, // Whether any BO items are present on the order
  isSome: false, // Whether some BO items are waiting for transfer
  someDates: false, // Whether some BO items have ESDs that are not transfer status
  isAll: true, // Whether all BO items are waiting for transfer or have dates
  probItems: false // Whether there are items genuinely with no ESD
};

/*
////////////////////////////// Begin frame functions //////////////////////////////
const addFlagsIframe = () => {
  const flagFrame = document.createElement("iframe");
  flagFrame.src = document.querySelector("#custbody_order_processing_flags_val > iframe").src;
  flagFrame.title = 'Order Flags';
  flagFrame.id = 'FlagsFrame';
  flagFrame.style.width = '200px';
  flagFrame.style.resize = 'both';
  flagFrame.style.overflow = 'auto';

  // Choose element to attach frame to
  document.querySelector("#tr_fg_fieldGroup621").before(flagFrame);
}

let frameDoc;

const frameTest = () => {
  // const testVal = frameDoc.querySelectorAll("a");
  // const testVal = frameDoc.querySelectorAll("div");
  // console.log(testVal);
  console.log(frameDoc);
}

const setFrameVars = () => {
  const shipquoteFrame = document.getElementById('FlagsFrame');
  frameDoc = shipquoteFrame.contentDocument;
  setTimeout(frameTest, 2000);
}
*/


////////////////////////////// Begin check functions //////////////////////////////

// Preset requisite columns
const table = {
  SKUs: [],
  desc: [],
  qty: [],
  freight: []
}

// Function to call first to fill above arrays
const fillColumnArrays = () => {
  // console.log("theTable is:");
  theTable = theTable.filter((row) => { return (row[0] != "") });
  // console.log(theTable);
  theTable.forEach((element) => {
    table.SKUs.push(element[0]);
    table.desc.push(element[1]);
    table.qty.push(element[6]);
    table.freight.push(element[itmCol.needsFreight]);
  });
}

const boESDCheck = () => {
  for (let i = 0; i <= theTable.length - 1; i++) {
    if (theTable[i][itmCol.numBO] > 0 && theTable[i][itmCol.boStatus] == 'In stock! Awaiting transfer') {
      boESDs.skus.push(theTable[i][itmCol.itmSKU]);
      boESDs.boItems.push(theTable[i][itmCol.itmSKU]);
    } else if (theTable[i][itmCol.numBO] > 0 && theTable[i][itmCol.boStatus] != 'In stock! Awaiting transfer' && !(theTable[i][itmCol.itemType] == "Drop Ship" || theTable[i][itmCol.itemType] == "Special")) {
      boESDs.boItems.push(theTable[i][itmCol.itmSKU]);
      if (theTable[i][itmCol.boStatus] != '' && ((!theTable[i][itmCol.boStatus].includes('ESD')) && !theTable[i][itmCol.boStatus].includes('due on'))) {
        boESDs.noDates.push(theTable[i][itmCol.itmSKU]);
      } else {
        boESDs.hasDates.push(theTable[i][itmCol.itmSKU]);
      }
    }
  }
  if (boESDs.skus.length != 0) { boESDs.isSome = true };
  if (boESDs.noDates.length != 0) { boESDs.probItems = true; boESDs.isAll = false };
  if (boESDs.boItems.length != 0) { boESDs.isBO = true };
  if (boESDs.hasDates.length != 0) { boESDs.someDates = true };
}

const lowDiscountCheck = () => {
  if (document.querySelector("#discountrate_fs_lbl_uir_label")) {
    let discount = isEd ? document.querySelector("#discountrate_fs_lbl_uir_label").nextElementSibling.firstElementChild.firstElementChild.value : document.querySelector("#discountrate_fs_lbl_uir_label").nextElementSibling.innerText;
    discount = Number(discount.substring(0, discount.length - 1));
    if (Math.abs(discount) > 15) {
      flags.discountHigh = true;
    }
  }
}

const customTopGrommetCheck = () => {
  const iteArray = table.SKUs;
  const descArray = table.desc;
  const qtyArray = table.qty;
  const deskInds = [];
  const gromInds = [];
  let deskQty = 0
  let gromQty = 0
  // const isCust = new RegExp(/Custom.*Desk/);
  // const isGrom = new RegExp(/grommet/);
  // console.log("table is:");
  // console.log(table);
  descArray.forEach((element, index) => {
    if (element.includes('Custom') && element.includes('Desk') && !iteArray[index].includes('PARENT') && !iteArray[index].includes('SAMPLE')) {
      deskInds.push(index);
      deskQty += Number(qtyArray[index]);
    } else if (element.includes('grommet') || element.includes('Grommet')) {
      gromInds.push(index);
      if (iteArray[index].includes('KITGROMMET-none')) {
        gromQty += Number(qtyArray[index]) * 2;
      } else {
        gromQty += Number(qtyArray[index]);
      }
    }
  });
  if (gromQty < deskQty) {
    flags.custNoGroms = true;
  }
  if (deskQty > 0) {
    flags.hasCustom = true;
  }
}

const intlShipCheck = () => {
  const shipAdd = isEd ? document.querySelector("#shipaddress").innerHTML : document.querySelector("#shipaddress_fs_lbl_uir_label").nextElementSibling.innerText;
  const usContl = new RegExp(/AL|AZ|AR|CA|CO|CT|DE|DC|FL|GA|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|VI|WA|WV|WI|WY/);
  let shipCost = 0;
  if (isEd) {
    if (document.querySelector("#shippingcost_formattedValue")) {
      shipCost = Number(document.querySelector("#shippingcost_formattedValue").value);
    }
  } else {
    if (document.querySelector("#shippingcost_fs_lbl_uir_label")) {
      shipCost = Number(document.querySelector("#shippingcost_fs_lbl_uir_label").nextElementSibling.innerText);
    } else { shipCost = 0 };
  }
  if (!usContl.test(shipAdd) && shipCost == 0) {
    flags.needShipCost = true;
  }
}

const problemSKUCheck = () => {
  const problemSKUs = ["TOP433-60x30-B2S", "TOP433-72x30-B2S", "TOP433-80x30-B2S"];
  const iteArray = table.SKUs;
  const badSKUs = [];
  problemSKUs.forEach((sku) => {
    if (iteArray.includes(sku)) {
      badSKUs.push(sku);
    }
  });
  flags.probSKUs = badSKUs;
  if (badSKUs.length > 0) {
    flags.hasProbSKU = true
  };
};

const freightSKUCheck = () => {
  const freightArray = table.freight;
  const iteArray = table.SKUs;
  const freightSKUs = [];
  const shipMethod = (isEd) ? document.querySelector("#shipmethod_fs_lbl_uir_label").nextElementSibling.firstElementChild.firstElementChild.firstElementChild.value : document.querySelector("#shipmethod_fs_lbl_uir_label").nextElementSibling.innerText;
  freightArray.forEach((line, index) => {
    if (line == "Yes") {
      freightSKUs.push(iteArray[index]);
    }
  });
  flags.freightSKUs = freightSKUs;
  if (freightSKUs.length != 0) {
    flags.needsFreight = true;
  }
  if (shipMethod.toLowerCase().includes("freight")) {
    flags.isFreight = true;
  }
}

const shouldFreightCheck = () => {
  const iteArray = table.SKUs;
  const descArray = table.desc;
  const problemSKUs = [];
  if (!flags.isFreight) {
    descArray.forEach((element, index) => {
      if (element.replace("\n", " ").includes("Ping Pong") && element.includes("Custom")) {
        problemSKUs.push(iteArray[index]);
      }
    });
    if (problemSKUs.length > 0) {
      flags.shouldFreight = true;
      flags.shouldFSKUs = problemSKUs;
    }
  }
}

const freightQsCheck = () => {
  if (isEd && document.querySelector("#inpt_salesrep_1")) {
    if (document.querySelector("#inpt_salesrep_1").value != "Web Processing") {
      flags.isSPOrder = true
    }
  }
  if (document.querySelector("#custbody_sales_pro_lbl_uir_label")) {
    flags.isSPOrder = true;
  }
  if (document.querySelector("#customsublist53txt")) {
    if (document.querySelector("#customsublist53txt").nextElementSibling) {
      if (!document.querySelector("#customsublist53txt").nextElementSibling.outerHTML.includes('display:none;')) {
        flags.hasFreightQs = true;
      }
    }
  }
}

// const ogFlagsCheck = () => {
//   // Script for OP flags
//   // https://1206578.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=6165*
//   if (url.includes("script=6165")) {
//     localStorage.setItem("opFlags", "some");
//     console.log(`Stored ${localStorage.opFlags} to session storage`)
//   } else {
//     console.log(localStorage.getItem("opFlags"));
//   }
// }

// const ogFlagsCheck = () => {
//   // In the sending document:
//   if (url.includes("script=6165")) {
//     window.postMessage('Hello from document 1!', '*');
//   } else {
//     // In the receiving document:
//     window.addEventListener('message', function (event) {
//       if (event.origin === 'https://1206578.app.netsuite.com/') { // Check the origin for security
//         console.log(event.data); // Output: "Hello from document 1!"
//       }
//     });
//   }
// }

const ogFlagsCheck = () => {
  if (url.includes("script=6165")) {
    globalThis.myProperty = "hello";
  } else {
    console.log(globalThis.myProperty);
  }
}

window.addEventListener('load', function () {
  ogFlagsCheck();
})



////////////////////////////// End check functions //////////////////////////////

/**
 * A function to build custom flags
 * @constructor
 * @param id {string} - The ID which will be passed to the element upon construction. The checkbox will be given the same ID and appended with "check"
 * @param text {string} - The text which will be put next to the flag
 * @param test {boolean} - Should be a statement or variable which will evaluate to true or false. Will determine if the flag is shown (true) or not (false)
 * @param color {string} - Flag colors can be "green", "yellow", or "red"
 */
const flagBuilder = (id, text, test, color) => {
  const flag = document.createElement("div");
  flag.id = id;
  if (test) {
    flag.style.display = "flex";
  } else {
    flag.style.display = "none";
  }
  const flagBG = document.createElement("div");
  flagBG.style.position = "relative";
  flagBG.style.display = "grid";
  // flagBG.style.flexWrap = "wrap";
  flagBG.style.gridTemplateColumns = "auto auto";
  flagBG.style.alignContent = "center";
  flagBG.style.height = "auto";
  flagBG.style.borderRadius = "8px";
  flagBG.style.padding = "0px 6px";
  flagBG.style.margin = "0px 12px 12px 0px";
  switch (color) {
    case "yellow":
      flagBG.style.backgroundColor = "#fffc85";
      break;
    case "red":
      flagBG.style.backgroundColor = "#ed6b6b";
      break;
    case "green":
      flagBG.style.backgroundColor = "#b0f3c2";
      break;
  }
  const flagInner = document.createElement("div");
  const flagChk = document.createElement("input");
  flagChk.type = "checkbox";
  flagChk.id = id + "check";
  flagChk.checked = "true";
  const flagP = document.createElement("p");
  flagP.style.marginLeft = "5px";
  flagP.innerHTML = text;
  flagInner.appendChild(flagChk);
  flagInner.appendChild(flagP);
  // flagBG.appendChild(flagInner);
  flagBG.appendChild(flagChk);
  flagBG.appendChild(flagP);
  flag.appendChild(flagBG);
  return flag;
}

const performChecks = () => {
  boESDCheck();
  lowDiscountCheck();
  customTopGrommetCheck();
  intlShipCheck();
  problemSKUCheck();
  freightSKUCheck();
  shouldFreightCheck();
  freightQsCheck();
  // ogFlagsCheck();
}

const buildCustomFlags = () => {
  const flagDiv = document.createElement("div");
  flagDiv.style.fontSize = "13px";
  flagDiv.id = "custflags";
  // BO flag for items with no ESD
  const boESDFlag = flagBuilder("boflag", boESDs.isAll ? `Backorders present but all BO items are waiting for transfer ${boESDs.isSome ? "(" + boESDs.skus.join(', ') + ")" : ""}${boESDs.someDates ? ` or have dates (${boESDs.hasDates.join(', ')})` : ""}` : boESDs.probItems ? `Backorders present, problem items exist with no ESD (${boESDs.noDates.join(', ')})` : ``, (boESDs.isBO && (boESDs.isSome || boESDs.probItems)), boESDs.isAll ? "green" : "red");
  flagDiv.appendChild(boESDFlag);
  // Discount flag for a discount over 10%
  const discountFlag = flagBuilder("dscflag", "Order discount is over 15%", flags.discountHigh, "yellow");
  flagDiv.appendChild(discountFlag);
  // Flag for checking if custom desktops are present and if so have grommet SKUs
  const customsFlag = flagBuilder("custsflag", flags.custNoGroms ? "Order contains custom desktops and too few grommet SKUs" : "Order contains custom desktops", flags.hasCustom, flags.custNoGroms ? "red" : "yellow");
  flagDiv.appendChild(customsFlag);
  // Flag for checking if the order is going outside US48 and has a ship cost
  const shipCostFlag = flagBuilder("us48shipflag", "Order is outside US48 but no ship cost is present", flags.needShipCost, "red");
  flagDiv.appendChild(shipCostFlag);
  // Flag for checking if a problem SKU is on an order
  const probSKUFlag = flagBuilder("probskuflag", `Order contains one or more problem items (${flags.probSKUs.join(", ")})`, flags.hasProbSKU, "red");
  flagDiv.appendChild(probSKUFlag);
  // Flag for displaying what items (if any) must ship freight
  const freightFlag = flagBuilder("freightflag", flags.needsFreight ? `Order must ship freight due to (${flags.freightSKUs.join(", ")})${flags.isFreight ? "" : " but ship method is not freight"}` : `Order is shipping freight but no items require it`, (flags.isFreight || flags.needsFreight), flags.needsFreight ? (flags.isFreight ? "green" : "red") : "yellow");
  flagDiv.appendChild(freightFlag);
  // Flag for checking if an item that should ship freight is not tripping the ship method
  const shouldFreightFlag = flagBuilder("shouldfreightflag", `Items present need freight (${flags.shouldFSKUs.join(', ')}) but ship method is non-freight`, flags.shouldFreight, "red")
  flagDiv.appendChild(shouldFreightFlag);
  // Flag for checking if an order that is shipping freight has a freight questionnaire
  const freightQsFlag = flagBuilder("freightQsFlag", flags.isSPOrder ? `Order is shipping freight and no questionnaire is present, but the order is manual` : `Order is shipping freight and no questionnaire is present`, (flags.isFreight && !flags.hasFreightQs), flags.isSPOrder ? "yellow" : "red");
  flagDiv.appendChild(freightQsFlag);
  ///// Add all flags to document /////
  document.querySelector("#custbody_order_processing_flags_val").after(flagDiv);
}

const tableCheck = VM.observe(document.body, () => {
  // Find the target node
  const node = (isEd) ? document.querySelector(`#item_row_1 > td:nth-child(1)`) : document.querySelector(`#item_splits > tbody > tr:nth-child(2) > td:nth-child(1)`);

  if (node) {
    // console.log('Building item table')
    theTable = buildItemTable();
    // Filter out empty rows which can cause false positives in checks
    fillColumnArrays();
    // console.log(theTable);
    // console.log('Checking flag conditions')
    performChecks();
    // console.log('Inserting custom flags')
    buildCustomFlags();

    // disconnect observer
    return true;
  }
});

/* const flagCheck = VM.observe(document.body, () => {
  // Find the target node
  const node = document.querySelector("#custbody_order_processing_flags_val");

  if (node) {
    addFlagsIframe();
    setTimeout(setFrameVars, 6000);

    // disconnect observer
    return true;
  }
}); 
*/
