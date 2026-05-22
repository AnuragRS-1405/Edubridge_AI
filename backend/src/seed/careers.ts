import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Career from '../models/Career';

// Attempt to load .env from the backend root if it exists
dotenv.config();

const careersData = [
  { role: "Data Analyst", requiredSkills: { python: 60, sql: 70, statistics: 50 }, demandScore: 85, description: "Analyze datasets to uncover insights and drive business decisions.", learningResources: [] },
  { role: "Machine Learning Engineer", requiredSkills: { python: 80, ml_frameworks: 70, math: 65 }, demandScore: 90, description: "Build and deploy ML models at scale.", learningResources: [] },
  { role: "Web Developer", requiredSkills: { javascript: 70, html_css: 65, react: 60 }, demandScore: 80, description: "Build responsive web applications using modern frameworks.", learningResources: [] },
  { role: "Data Engineer", requiredSkills: { python: 70, sql: 80, cloud: 60 }, demandScore: 88, description: "Design and maintain data pipelines and infrastructure.", learningResources: [] },
  { role: "Business Analyst", requiredSkills: { sql: 55, excel: 60, statistics: 50 }, demandScore: 75, description: "Bridge the gap between business needs and technical solutions.", learningResources: [] },
  { role: "DevOps Engineer", requiredSkills: { linux: 70, cloud: 75, docker: 70 }, demandScore: 87, description: "Streamline CI/CD and infrastructure automation.", learningResources: [] },
  { role: "Frontend Developer", requiredSkills: { javascript: 75, react: 70, html_css: 80 }, demandScore: 82, description: "Craft pixel-perfect user interfaces with modern JS frameworks.", learningResources: [] }
];

const seedCareers = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables.');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    
    console.log('Clearing existing careers...');
    await Career.deleteMany({});
    
    console.log('Inserting seed data...');
    await Career.insertMany(careersData);
    
    console.log('✅ Seed completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }
};

seedCareers();
