export interface EbayTemplateDetails {
  brand?: string | null;
  partNumber: string;
  partName?: string | null;
  condition?: string | null;
  model?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateEbayHtmlTemplate(details: EbayTemplateDetails): string {
  const brand = escapeHtml(details.brand || 'Appliance');
  const name = escapeHtml(details.partName || 'Appliance Component');
  const partNumber = escapeHtml(details.partNumber);
  const model = details.model ? escapeHtml(details.model) : null;
  const conditionLabel = details.condition === 'new'
    ? 'New'
    : 'Used - inspected and prepared for resale';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #333;
      line-height: 1.6;
      margin: 0;
      padding: 20px;
      background-color: #f9fafb;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .header {
      background-color: #111827;
      padding: 24px;
      text-align: center;
      border-bottom: 4px solid #3B82F6;
    }
    .namemark {
      font-size: 28px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.025em;
    }
    .namemark-accent {
      color: #3B82F6;
    }
    .content {
      padding: 32px;
    }
    h1 {
      font-size: 24px;
      color: #111827;
      margin-top: 0;
      margin-bottom: 16px;
      border-bottom: 2px solid #f3f4f6;
      padding-bottom: 8px;
    }
    .specs-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 32px;
    }
    .specs-table th, .specs-table td {
      padding: 12px;
      border: 1px solid #e5e7eb;
      text-align: left;
    }
    .specs-table th {
      background-color: #f9fafb;
      font-weight: 600;
      width: 30%;
    }
    .section-title {
      font-size: 20px;
      font-weight: 700;
      margin-top: 24px;
      margin-bottom: 12px;
      color: #1f2937;
    }
    .policy-box {
      background-color: #f3f4f6;
      border-left: 4px solid #3B82F6;
      padding: 16px;
      margin-bottom: 16px;
      border-radius: 0 4px 4px 0;
    }
    .footer {
      background-color: #f9fafb;
      padding: 20px;
      text-align: center;
      font-size: 14px;
      color: #6b7280;
      border-top: 1px solid #e5e7eb;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="namemark">Roadrunner<span class="namemark-accent">Parts</span></div>
    </div>
    
    <div class="content">
      <h1>${brand} ${name}</h1>
      
      <table class="specs-table">
        <tbody>
          <tr>
            <th>Part Number</th>
            <td><strong>${partNumber}</strong></td>
          </tr>
          <tr>
            <th>Brand</th>
            <td>${brand}</td>
          </tr>
          <tr>
            <th>Part Name</th>
            <td>${name}</td>
          </tr>
          <tr>
            <th>Condition</th>
            <td>${conditionLabel}</td>
          </tr>
          ${model ? `
          <tr>
            <th>Donor / Reference Model</th>
            <td>${model}</td>
          </tr>` : ''}
        </tbody>
      </table>

      <div class="section-title">Item Description</div>
      <p>You are purchasing the appliance part listed above. Used parts are removed from inspected appliances and prepared for resale before listing. Please verify your model number, part number, photos, and connector or mounting details before ordering.</p>

      <div class="section-title">Shipping & Handling</div>
      <div class="policy-box">
        <p style="margin: 0;">We professionally pack and ship all items within 1 business day. Expedited shipping options are available at checkout.</p>
      </div>

      <div class="section-title">Returns</div>
      <div class="policy-box">
        <p style="margin: 0;">Returns are handled under the return terms shown on this eBay listing. Returned parts must be sent back in the same condition received.</p>
      </div>
    </div>

    <div class="footer">
      Thank you for shopping with Roadrunner Parts. Your trusted source for professional appliance components.
    </div>
  </div>
</body>
</html>
  `.trim();
}
