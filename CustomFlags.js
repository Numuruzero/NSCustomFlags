// ==UserScript==
// @name        NetSuite Custom Flags
// @namespace   jhutt.com
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/salesord.nl*
// @require     https://cdn.jsdelivr.net/npm/@violentmonkey/dom@2
// @downloadURL https://raw.githubusercontent.com/Numuruzero/NSCustomFlags/main/CustomFlags.js
// @version     0.1
// @description Provides a space for custom flags on orders
// ==/UserScript==


// Determine if the record is in edit mode
const edCheck = new RegExp('e=T');
const url = window.location.href;
let isEd;
edCheck.test(url) ? isEd = true : isEd = false;

// Custom flags
const flags = {
  boPresent : false,
  boItems : [],
  discountHigh : false
};

// Item row numbers
const itmCol = {
  set : false,
  itmSKU : "ITEM",
  boStatus : (isEd) ? "ESD (USED IN AUTOMATION)" : "STATUS",
  numBO : (isEd) ? "BACK ORDERED" : "# BACKORDERED"
};

// I might be able to make this more efficient by adding 5 to validity check variables and then counting down for a valid number
// Content rows start at 2, accounting for header row
/**
 * Gets the size of the order's item table programmatically, in rows
 * @return The final row number. This will not necessarily be the total number of literal rows, but the final row number in the HTML.
 */
const getRowCount = () => {
  let testRows;
  let lastRow = 0;
  let y = 2;
  testRows = document.querySelector("#item_splits > tbody > tr:nth-child(2) > td:nth-child(1)");
  // The lines are written differently in edit mode, so we'll need to account for this while counting rows
  if (isEd) {
    y = 1;
    while (testRows) {
      lastRow = y - 1;
      testRows = document.querySelector(`#item_row_${y} > td:nth-child(1)`);
      y++;
    }
  } else {
      while (testRows) {
        lastRow = y - 1;
        testRows = document.querySelector(`#item_splits > tbody > tr:nth-child(${y}) > td:nth-child(1)`);
        y++;
      }
    }
  return lastRow;
}

const getColumnCount = () => {
  let testColumns;
  let lastColumn = 0;
  let x = 1;
  testColumns = document.querySelector("#item_splits > tbody > tr:nth-child(2) > td:nth-child(1)");
  // The lines are written differently in edit mode, so we'll need to account for this while counting rows
  if (isEd) {
    while (testColumns) {
      lastColumn = x - 1;
      testColumns = document.querySelector(`#item_row_1 > td:nth-child(${x})`);
      x++;
    }
  } else {
      while (testColumns) {
      lastColumn = x - 1;
      testColumns = document.querySelector(`#item_splits > tbody > tr:nth-child(2) > td:nth-child(${x})`);
      x++;
      }
  }
  return lastColumn;
}

/**
 * Checks a text to see if it matches a column header, and sets according to the given number
 */
const checkItemHeader = (check, num) => {
  if (check === itmCol.itmSKU) {
    itmCol.itmSKU = num;
  } else if (check === itmCol.numBO) {
    itmCol.numBO = num;
  } else if (check === itmCol.boStatus) {
    itmCol.boStatus = num;
  }
}

// Build an array out of the table
const buildItemTable = () => {
  const itemTable = [];
  const totalRows = getRowCount();
  const totalColumns = getColumnCount();
  let currentRow = [];
  let row = 2;
  let column = 1;
  let aRow;
  if (isEd) {
    row = 1;
    while (row <= totalRows) {
      currentRow = [];
      while (column <= totalColumns) {
        aRow = document.querySelector(`#item_row_${row} > td:nth-child(${column})`).innerText;
        currentRow.push(aRow);
        if (!itmCol.set) checkItemHeader(document.querySelector(`#item_headerrow > td:nth-child(${column})`).innerText,column-1);
        column++;
      };
      itmCol.set = true;
      column = 1;
      itemTable.push(currentRow);
      row++
    };
  } else {
      while (row <= totalRows) {
      currentRow = [];
        while (column <= totalColumns) {
          aRow = document.querySelector(`#item_splits > tbody > tr:nth-child(${row}) > td:nth-child(${column})`).innerText;
          currentRow.push(aRow);
          if (!itmCol.set) checkItemHeader(document.querySelector(`#item_splits > tbody > tr.uir-machine-headerrow > td:nth-child(${column})`).innerText,column-1);
          column++;
        };
      itmCol.set = true;
      column = 1;
      itemTable.push(currentRow);
      row++
      };
  }
  console.log(itmCol);
  return itemTable;
}

let theTable = [];

const boESDs = {
  skus : [],
  isAll : true
};
const boESDCheck = () => {
  for (let i = 0; i <= theTable.length-1; i++) {
    if (theTable[i][itmCol.numBO] > 0 && theTable[i][itmCol.boStatus] == 'In stock! Awaiting transfer') {
      boESDs.skus.push(theTable[i][itmCol.itmSKU]);
    } else if (theTable[i][itmCol.numBO] > 0 && theTable[i][itmCol.boStatus] != 'In stock! Awaiting transfer') {
      boESDs.isAll = false;
    }
  }
}

const lowDiscountCheck = () => {
  if (document.querySelector("#discountrate_fs_lbl_uir_label")) {
    let discount = document.querySelector("#discountrate_fs_lbl_uir_label").nextElementSibling.innerText;
    discount = Number(discount.substring(0,discount.length-1));
    if (Math.abs(discount) > 10) {
      flags.discountHigh = true;
    }
  }
}

/**
 * A function to build various testing flags
 * @constructor
 * @param id {string} - The ID which will be passed to the element upon construction. The checkbox will be given the same ID and appended with "check"
 * @param text {string} - The text which will be put next to the flag
 * @param test - Should be a statement which will evaluate to true or false. Will determine if the flag is shown (true) or not (false)
 */
const flagBuilder = (id, text, test) => {
  const flag = document.createElement("div");
  flag.id = id;
  if (test) {
    flag.style.display = "flex";
  } else {
    flag.style.display = "none";
  }
  const flagChk = document.createElement("input");
  flagChk.type = "checkbox";
  flagChk.id = id + "check";
  flagChk.checked = "true";
  const flagP = document.createElement("p");
  flagP.style.marginLeft = "5px";
  flagP.innerHTML = text;
  flag.appendChild(flagChk);
  flag.appendChild(flagP);
  return flag;
}

const buildBOFlag = () => {
  const boFlag = document.createElement("div");
  boFlag.id = "boflag";
  if (boESDs.skus.length == 0) {
    boFlag.style.display = "none";
  } else {
    boFlag.style.display = "flex";
  }
  const boFlagChk = document.createElement("input");
  boFlagChk.type = "checkbox";
  boFlagChk.id = "boesd";
  boFlagChk.checked = "true";
  const boFlagP = document.createElement("p");
  boFlagP.style.marginLeft = "5px";
  boESDs.isAll == true ? boFlagP.innerHTML = "Backorder ESD flag exists but all BO items are waiting for transfer" : boFlagP.innerHTML = `Backorder ESD flag exists, some BO items (${boESDs.skus.join(', ')}) are waiting for transfer`;
  boFlag.appendChild(boFlagChk);
  boFlag.appendChild(boFlagP);
  // console.log(boESDs.skus);
  // if (boESDs.skus.length == 0) {
  //   console.log(boESDs.skus);
  // }
  return boFlag;
}

const performChecks = () => {
  boESDCheck();
  lowDiscountCheck();
}

const buildCustomFlags = () => {
  const flagDiv = document.createElement("div");
  flagDiv.id = "custflags";
  // BO flag for items with no ESD
  const boESDFlag = buildBOFlag();
  flagDiv.appendChild(boESDFlag);
  // Discount flag for a discount over 10%
  const discountFlag = flagBuilder("dscflag", "Order discount is over 10%", flags.discountHigh);
  flagDiv.appendChild(discountFlag);
  document.querySelector("#custbody_order_processing_flags_val").after(flagDiv);
}

const tableCheck = VM.observe(document.body, () => {
  // Find the target node
  const node = (isEd) ? document.querySelector(`#item_row_1 > td:nth-child(1)`) : document.querySelector(`#item_splits > tbody > tr:nth-child(2) > td:nth-child(1)`);

  if (node) {
    theTable = buildItemTable();
    console.log(theTable);
    performChecks();
    buildCustomFlags();

    // disconnect observer
    return true;
  }
});
