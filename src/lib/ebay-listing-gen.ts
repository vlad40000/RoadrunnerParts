export function generateEbayTitle({ brand, partNumber, partName, condition, model }) {
  const brandNorm = brand || "OEM";
  const nameNorm = partName || "Appliance Part";
  const condNorm = condition === "new" ? "New" : "Used Tested";
  const modelNorm = model ? `Fits ${model}` : "";
  
  const title = `${brandNorm} ${partNumber} ${nameNorm} ${condNorm} OEM ${modelNorm}`.trim();
  return title.substring(0, 80); // eBay limit
}

export function generateEbayDescription({ brand, partNumber, partName, condition, model }) {
  return `
Genuine ${brand || 'OEM'} Appliance Part
Part Number: ${partNumber}
Part Name: ${partName || 'Appliance Component'}
Condition: ${condition === 'new' ? 'Brand New' : 'Used - Pulled from working machine and tested'}
Compatible with Model: ${model || 'Various'}

Professionally handled and shipped fast from Roadrunner Parts.
  `.trim();
}
