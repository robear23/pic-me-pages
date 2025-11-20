interface EmailPreviewProps {
  content: {
    subject: string;
    headerTitle: string;
    openingParagraph: string;
    step1Title: string;
    step1Description: string;
    step2Title: string;
    step2Description: string;
    step3Title: string;
    step3Description: string;
    footerTagline: string;
    primaryColor: string;
    accentColor: string;
  };
  mode: "desktop" | "mobile";
}

const sampleData = {
  customerName: "Sarah Johnson",
  childName: "Emma",
  interests: "Dinosaurs, Space, Ocean Animals",
  orderId: "CMB-12345",
  orderDate: "November 20, 2025",
  totalAmount: "$34.99",
};

export function EmailPreview({ content, mode }: EmailPreviewProps) {
  const replaceVariables = (text: string): string => {
    let result = text;
    Object.entries(sampleData).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
    });
    return result;
  };

  const maxWidth = mode === "desktop" ? "600px" : "320px";

  return (
    <div className="w-full flex justify-center bg-gray-100 p-4 rounded-lg">
      <div style={{ maxWidth, width: "100%" }}>
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div
            style={{ backgroundColor: content.primaryColor }}
            className="p-8 text-center"
          >
            <h1 className="text-2xl font-bold text-white m-0">
              {replaceVariables(content.headerTitle)}
            </h1>
          </div>

          {/* Greeting */}
          <div className="p-6">
            <p className="text-gray-900 mb-3 text-base">
              Hi {sampleData.customerName},
            </p>
            <p className="text-gray-600 text-base leading-relaxed">
              {replaceVariables(content.openingParagraph)}
            </p>
          </div>

          {/* What Happens Next */}
          <div className="px-6 pb-6">
            <div
              style={{ backgroundColor: content.accentColor }}
              className="rounded-lg p-6"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-5">
                What Happens Next
              </h2>

              {/* Step 1 */}
              <div className="flex gap-3 mb-5">
                <div
                  style={{ backgroundColor: content.primaryColor }}
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                >
                  <span className="text-white font-bold">1</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1 text-base">
                    {replaceVariables(content.step1Title)}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {replaceVariables(content.step1Description)}
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-3 mb-5">
                <div
                  style={{ backgroundColor: content.primaryColor }}
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                >
                  <span className="text-white font-bold">2</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1 text-base">
                    {replaceVariables(content.step2Title)}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {replaceVariables(content.step2Description)}
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-3">
                <div
                  style={{ backgroundColor: content.primaryColor }}
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                >
                  <span className="text-white font-bold">3</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1 text-base">
                    {replaceVariables(content.step3Title)}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {replaceVariables(content.step3Description)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 text-center border-t border-gray-200">
            <p className="text-lg font-semibold text-gray-900 mb-2">
              Color Me In Books
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              {replaceVariables(content.footerTagline)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
