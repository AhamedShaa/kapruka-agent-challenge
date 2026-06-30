import { KaprukaAdapter } from '../src/adapters/kapruka.adapter.js'

const adapter = await KaprukaAdapter.create('live')
console.log('\n--- Testing live mode critical path ---\n')

try {
  const results = await adapter.search('red roses')
  console.log('✅ search:', results.products.length, 'products,', 'first:', results.products[0]?.name)
} catch (e) {
  console.log('❌ search FAILED:', e instanceof Error ? e.message : e)
}

try {
  const cityList = await adapter.listDeliveryCities()
  console.log('✅ listDeliveryCities:', cityList.cities.length, 'cities')
} catch (e) {
  console.log('❌ listDeliveryCities FAILED:', e instanceof Error ? e.message : e)
}

try {
  const cats = await adapter.listCategories()
  console.log('✅ listCategories:', cats.length, 'categories')
} catch (e) {
  console.log('❌ listCategories FAILED:', e instanceof Error ? e.message : e)
}

process.exit(0)