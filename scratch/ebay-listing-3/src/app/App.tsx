import { useState } from 'react';
import { Heart, Share2, ChevronLeft, ChevronRight, MapPin, Package, RotateCcw, ShieldCheck, Star } from 'lucide-react';

export default function App() {
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);

  const productImages = [
    '/api/placeholder/600/600',
    '/api/placeholder/600/600',
    '/api/placeholder/600/600',
    '/api/placeholder/600/600',
  ];

  const specifications = [
    { label: 'Brand', value: 'Unbranded' },
    { label: 'Type', value: 'Refrigerator' },
    { label: 'Capacity', value: '26 Quart (25L)' },
    { label: 'Power Input', value: '45W' },
    { label: 'Power Cord', value: 'Included: AC and DC' },
    { label: 'Low Battery Protection', value: 'Yes' },
    { label: 'Maximum Cooling Temperature', value: '-7°F' },
    { label: 'Package Method', value: 'Corrugated Box' },
    { label: 'Dimensions (LxWxH)', value: '23" x 13" x 14" inches (585 x 330 x 345 mm)' },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* eBay Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-8">
            <svg className="h-8 w-20" viewBox="0 0 100 40" fill="none">
              <text x="0" y="30" className="fill-[#E53238] font-bold text-[32px]" style={{ fontFamily: 'Arial' }}>eBay</text>
            </svg>
            <input
              type="text"
              placeholder="Search for anything"
              className="w-96 px-4 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a href="#" className="hover:text-blue-600">Sign in</a>
            <a href="#" className="hover:text-blue-600">Register</a>
          </div>
        </div>
      </header>

      {/* Product Section */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Image Gallery */}
          <div className="lg:col-span-2">
            <div className="flex gap-4">
              {/* Thumbnails */}
              <div className="flex flex-col gap-2">
                {productImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImage(idx)}
                    className={`w-16 h-16 border-2 rounded overflow-hidden ${
                      selectedImage === idx ? 'border-blue-600' : 'border-gray-200'
                    }`}
                  >
                    <img src={img} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>

              {/* Main Image */}
              <div className="flex-1 relative">
                <div className="aspect-square bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
                  <img
                    src={productImages[selectedImage]}
                    alt="Product"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex justify-between mt-4">
                  <button className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600">
                    <Heart className="w-4 h-4" /> Add to Watchlist
                  </button>
                  <button className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600">
                    <Share2 className="w-4 h-4" /> Share
                  </button>
                </div>

                {/* Additional Product Images */}
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="aspect-video bg-gray-100 rounded border border-gray-200">
                      <img src="/api/placeholder/200/150" alt={`Detail ${i}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Product Details */}
          <div className="lg:col-span-1">
            <div className="sticky top-4">
              <h1 className="text-2xl mb-2">26 Quart 25L Portable Outdoor Refrigerator Travel Car Cooling Fridge Freezer</h1>

              {/* Seller Info */}
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-200">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-white font-bold">
                  R
                </div>
                <div>
                  <p className="text-sm font-medium">RoadRunnerParts</p>
                  <div className="flex items-center gap-1 text-xs text-gray-600">
                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                    <span>99.2% positive</span>
                    <span className="text-gray-400">·</span>
                    <span>2.5K sold</span>
                  </div>
                </div>
              </div>

              {/* Price */}
              <div className="mb-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">US $244.97</span>
                </div>
                <p className="text-sm text-gray-600">or 4 payments of $61.24 with Klarna. <a href="#" className="text-blue-600">Learn more</a></p>
              </div>

              {/* Condition */}
              <div className="mb-4 pb-4 border-b border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Condition:</span>
                  <span className="font-medium">New</span>
                </div>
              </div>

              {/* Quantity */}
              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-2">Quantity:</label>
                <div className="flex items-center border border-gray-300 rounded w-32">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="px-3 py-2 hover:bg-gray-50"
                  >
                    -
                  </button>
                  <input
                    type="text"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    className="flex-1 text-center border-x border-gray-300 py-2"
                  />
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="px-3 py-2 hover:bg-gray-50"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 mb-6">
                <button className="w-full bg-[#3665F3] hover:bg-[#2952CC] text-white py-3 rounded-full font-medium transition-colors">
                  Buy It Now
                </button>
                <button className="w-full bg-[#3499F3] hover:bg-[#2580D9] text-white py-3 rounded-full font-medium transition-colors">
                  Add to cart
                </button>
                <button className="w-full border-2 border-gray-300 hover:border-gray-400 text-gray-700 py-3 rounded-full font-medium transition-colors">
                  Add to Watchlist
                </button>
              </div>

              {/* Additional Services */}
              <div className="mb-6 pb-6 border-b border-gray-200">
                <p className="text-sm font-medium mb-2">Additional service available</p>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" />
                  <span>3-year protection plan from Allstate - $48.99</span>
                </label>
              </div>

              {/* Shipping & Returns */}
              <div className="space-y-3 text-sm">
                <div className="flex gap-3">
                  <Package className="w-5 h-5 text-gray-600 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Shipping, returns, and payments</p>
                    <p className="text-gray-600">Free Standard Shipping</p>
                    <p className="text-gray-600">Estimated delivery: Thu, May 15 - Mon, May 19</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <RotateCcw className="w-5 h-5 text-gray-600 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Returns</p>
                    <p className="text-gray-600">30 days returns. Buyer pays for return shipping.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <ShieldCheck className="w-5 h-5 text-gray-600 flex-shrink-0" />
                  <div>
                    <p className="font-medium">eBay Money Back Guarantee</p>
                    <p className="text-gray-600">Get the item you ordered or get your money back.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <MapPin className="w-5 h-5 text-gray-600 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Ships from</p>
                    <p className="text-gray-600">United States</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs & Specifications */}
        <div className="mt-12 border-t border-gray-200">
          <div className="flex gap-8 border-b border-gray-200">
            <button className="px-4 py-4 border-b-2 border-blue-600 text-blue-600 font-medium">
              About this item
            </button>
            <button className="px-4 py-4 text-gray-600 hover:text-gray-900">
              Shipping
            </button>
            <button className="px-4 py-4 text-gray-600 hover:text-gray-900">
              Returns
            </button>
          </div>

          {/* Item Specifics */}
          <div className="py-8">
            <h2 className="text-xl font-bold mb-6">Item specifics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
              {specifications.map((spec, idx) => (
                <div key={idx} className="flex py-3 border-b border-gray-100">
                  <span className="text-gray-600 w-48 flex-shrink-0">{spec.label}</span>
                  <span className="font-medium">{spec.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="py-8 border-t border-gray-200">
            <h2 className="text-xl font-bold mb-4">Description</h2>
            <div className="bg-gradient-to-r from-blue-50 to-yellow-50 p-8 rounded-lg mb-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center">
                  <Package className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">26 Quart Portable Refrigerator</h3>
                  <p className="text-yellow-700 font-medium">Premium Cooling Solution</p>
                </div>
              </div>
            </div>

            <div className="prose max-w-none">
              <p className="text-gray-700 mb-4">
                You never have to worry about keeping your food cold or buying energy bags at the park this trip or weekend outing!
                This device is made for fast cooling, with a length of premium insulation to keep the cooling consistent.
              </p>

              <p className="text-gray-700 mb-4">
                This is an all-wheel and dual compressor, you can be of made, and little handle won't heat from other compartment.
                Quick switch between freezer and refrigerator mode, all while powered by dual use battery pack during your drives.
              </p>

              <p className="text-gray-700 mb-4">
                Whether you're off to the park for a picnic, or to the road camping for months, it's invaluable for keeping your food fresh and
                your drinks cold.
              </p>

              <div className="bg-blue-50 border-l-4 border-blue-600 p-4 mt-6">
                <p className="text-sm text-gray-700">
                  <strong>Note:</strong> Please review our return policy on the <a href="#" className="text-blue-600 underline">Store FAQ of California</a> or state statutes or
                  other representative forms.
                </p>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="py-8 border-t border-gray-200">
            <h2 className="text-xl font-bold mb-6">Specifications and Features:</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold">✓</span>
                </div>
                <div>
                  <h4 className="font-medium mb-1">Large capacity of 25L</h4>
                  <p className="text-sm text-gray-600">Lightweight of only 24 lbs</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold">✓</span>
                </div>
                <div>
                  <h4 className="font-medium mb-1">Low energy consumption</h4>
                  <p className="text-sm text-gray-600">AC power cord and DC car power included</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold">✓</span>
                </div>
                <div>
                  <h4 className="font-medium mb-1">Car Low-battery protection</h4>
                  <p className="text-sm text-gray-600">Built-in lithium battery to provide 8 hours runtime</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold">✓</span>
                </div>
                <div>
                  <h4 className="font-medium mb-1">Maximum Cooling Temperature</h4>
                  <p className="text-sm text-gray-600">Cools down to -7°F</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-200 mt-12 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-center gap-8 text-sm text-gray-600">
            <a href="#" className="hover:text-blue-600">About eBay</a>
            <a href="#" className="hover:text-blue-600">Help & Contact</a>
            <a href="#" className="hover:text-blue-600">Selling</a>
            <a href="#" className="hover:text-blue-600">Policies</a>
          </div>
          <p className="text-center text-xs text-gray-500 mt-4">
            Copyright © 1995-2026 eBay Inc. All Rights Reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}