const { google } = require('googleapis');

// Load the service account key JSON file
const KEYFILEPATH = `config/gsheet/plasma-block-434309-m2-41eb7c8206d2.json`; // Update with your JSON file path

// Load the JWT with the service account credentials
const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILEPATH,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const GoogleSheetsProvider = {
  appendData: // Function to append data
    async (data, sheetName, sheetId) => {
      const authClient = await auth.getClient();
      const sheets = google.sheets({ version: 'v4', auth: authClient });

      const request = {
        spreadsheetId: sheetId,
        range: `${sheetName}`, // Use the sheet name to target the whole sheet
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: data, // Data to be appended
        },
      };

      try {
        const response = await sheets.spreadsheets.values.append(request);
        console.log(`${response.data.updates.updatedRows} rows appended.`);
      } catch (err) {
        console.error('Error appending data:', err);
      }
    },
  readData: async (sheetName, sheetId) => {
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });


    // Fetch data from the specified range in the Google Sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}`,
    });

    // Output the retrieved rows
    const rows = response.data.values;
    return rows


  },
}



module.exports = GoogleSheetsProvider