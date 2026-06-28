import { Hero } from '../components/Hero'
import { CoreFeatures } from '../components/CoreFeatures'
import { ProductTour } from '../components/ProductTour'
import { CompareSection } from '../components/CompareSection'
import { ScenesSection } from '../components/ScenesSection'
import { FinalCTA, Footer } from '../components/FinalCTA'

export function HomePage() {
  return (
    <div className="min-h-screen pt-24">
      <Hero />
      <CoreFeatures />
      <ProductTour />
      <CompareSection />
      <ScenesSection />
      <FinalCTA />
      <Footer />
    </div>
  )
}
