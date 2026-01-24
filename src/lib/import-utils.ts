import { read, utils } from 'xlsx';

export interface ImportedHolding {
    symbol: string;
    quantity: number;
    buyPrice: number;
    name?: string;
}

export const parsePortfolioFile = async (file: File): Promise<ImportedHolding[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = read(data, { type: 'array' });

                // Get first sheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Convert to JSON
                const jsonData = utils.sheet_to_json(worksheet) as any[];

                // Map to holdings
                const holdings: ImportedHolding[] = jsonData.map((row) => {
                    // Try to guess columns broadly
                    const symbol = row['Symbol'] || row['Ticker'] || row['Stock'] || row['symbol'];
                    const quantity = row['Quantity'] || row['Qty'] || row['Shares'] || row['quantity'];
                    const buyPrice = row['Buy Price'] || row['Avg Price'] || row['Price'] || row['buyPrice'];
                    const name = row['Name'] || row['Company'] || row['name'] || symbol;

                    if (!symbol || !quantity || !buyPrice) {
                        return null;
                    }

                    // Format symbol for Indian markets if needed (assuming NS default if no extension)
                    let cleanSymbol = String(symbol).toUpperCase();
                    if (!cleanSymbol.includes('.') && /^[A-Z]+$/.test(cleanSymbol)) {
                        cleanSymbol += '.NS';
                    }

                    return {
                        symbol: cleanSymbol,
                        quantity: Number(quantity),
                        buyPrice: Number(buyPrice),
                        name: String(name)
                    };
                }).filter((h): h is ImportedHolding => h !== null);

                resolve(holdings);
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};
