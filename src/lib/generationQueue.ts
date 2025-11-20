import { generateImages } from './api';
import type { GeneratedPrompt, GeneratedPage, Character } from './api';

interface BookJob {
  id: string;
  prompts: GeneratedPrompt[];
  characters: Character[];
  consistentCharacters: boolean;
  complexity: string;
  onProgress: (percent: number, status: string) => void;
  resolve: (results: GeneratedPage[]) => void;
  reject: (error: Error) => void;
}

interface DailyUsage {
  count: number;
  date: string;
}

class BookGenerationQueue {
  private queue: BookJob[] = [];
  private isProcessing = false;
  private currentJobId: string | null = null;
  private shouldCancel = false;
  
  // Configuration
  private readonly DELAY_MS = 6000; // 6 seconds = 10 RPM (free tier)
  private readonly DAILY_LIMIT = 500;
  private readonly CALLS_PER_BOOK = 28; // Approximate
  private readonly STORAGE_KEY = 'book_generation_daily_usage';
  private readonly PAGE_TIMEOUT_MS = 120000; // 2 minutes per page
  
  constructor() {
    this.checkDailyReset();
  }
  
  cancelCurrentJob() {
    console.log('🛑 Cancelling current job:', this.currentJobId);
    this.shouldCancel = true;
  }
  
  getCurrentJobId(): string | null {
    return this.currentJobId;
  }
  
  async addBook(
    prompts: GeneratedPrompt[],
    characters: Character[],
    consistentCharacters: boolean,
    complexity: string,
    onProgress: (percent: number, status: string) => void
  ): Promise<GeneratedPage[]> {
    // Check daily limit
    if (!this.canGenerateBook(prompts.length)) {
      const status = this.getStatus();
      throw new Error(
        `Daily limit reached (${status.dailyUsed}/${this.DAILY_LIMIT} requests used). ` +
        `Only ${status.booksRemaining} book${status.booksRemaining === 1 ? '' : 's'} can be generated today. ` +
        `The limit resets at midnight UTC.`
      );
    }
    
    const id = crypto.randomUUID();
    
    return new Promise((resolve, reject) => {
      this.queue.push({ 
        id, 
        prompts, 
        characters, 
        consistentCharacters,
        complexity,
        onProgress, 
        resolve, 
        reject 
      });
      
      const position = this.queue.length;
      if (position > 1) {
        const waitMinutes = (position - 1) * 4;
        onProgress(0, `You're #${position} in queue. Estimated wait: ${waitMinutes} minute${waitMinutes === 1 ? '' : 's'} ⏱️`);
      } else {
        onProgress(0, 'Starting your book generation...');
      }
      
      this.processQueue();
    });
  }
  
  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.updateQueuePositions();
      
      try {
        const results = await this.generateBook(job);
        job.resolve(results);
      } catch (error) {
        job.reject(error as Error);
      }
    }
    
    this.isProcessing = false;
  }
  
  private async generateBook(job: BookJob): Promise<GeneratedPage[]> {
    const total = job.prompts.length;
    const allPages: GeneratedPage[] = [];
    this.currentJobId = job.id;
    this.shouldCancel = false;
    
    job.onProgress(5, 'Preparing to generate your coloring pages...');
    
    // Process pages one at a time with rate limiting
    for (let i = 0; i < total; i++) {
      // Check for cancellation
      if (this.shouldCancel) {
        console.log('🛑 Generation cancelled by user');
        this.shouldCancel = false;
        this.currentJobId = null;
        throw new Error('Generation cancelled by user');
      }
      const currentPrompt = job.prompts[i];
      const pageNum = i + 1;
      
      job.onProgress(
        Math.round(((i + 0.5) / total) * 100),
        `Creating page ${pageNum} of ${total}... 🎨`
      );
      
      try {
        // Call the edge function with a single prompt with timeout
        const result = await Promise.race([
          this.callAPIWithRetry(
            [currentPrompt],
            job.characters,
            job.consistentCharacters,
            job.complexity
          ),
          this.createTimeout(this.PAGE_TIMEOUT_MS, `Page ${pageNum}`)
        ]);
        
        if (result.pages && result.pages.length > 0) {
          allPages.push(result.pages[0]);
          
          // Update daily usage counter
          this.incrementDailyUsage();
        } else {
          throw new Error(`Failed to generate page ${pageNum}`);
        }
        
        // Add delay between pages (except for the last page)
        if (i < total - 1) {
          job.onProgress(
            Math.round(((i + 0.8) / total) * 100),
            `Page ${pageNum} complete! Taking a brief pause... ☕`
          );
          await this.delay(this.DELAY_MS);
        }
        
      } catch (error: any) {
        console.error(`Failed to generate page ${pageNum}:`, error);
        // Add error page but continue
        allPages.push({
          pageNumber: currentPrompt.pageNumber,
          imageUrl: '',
          prompt: currentPrompt.prompt,
          error: error.message || 'Generation failed'
        });
      }
    }
    
    job.onProgress(100, '✨ Your coloring book is ready!');
    this.currentJobId = null;
    return allPages;
  }
  
  private createTimeout(ms: number, context: string): Promise<never> {
    return new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Timeout after ${ms / 1000}s (${context})`)), ms)
    );
  }
  
  private async callAPIWithRetry(
    prompts: GeneratedPrompt[],
    characters: Character[],
    consistentCharacters: boolean,
    complexity: string,
    maxRetries = 3
  ): Promise<{ pages: GeneratedPage[]; successCount: number; totalCount: number }> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Check for cancellation during retries
      if (this.shouldCancel) {
        throw new Error('Generation cancelled by user');
      }
      
      try {
        return await generateImages(prompts, characters, consistentCharacters, undefined, undefined, complexity);
      } catch (error: any) {
        const isRateLimitError = error.message?.includes('Rate limit') || error.message?.includes('429');
        
        if (isRateLimitError && attempt < maxRetries - 1) {
          // Exponential backoff: 30s, 60s, 120s
          const waitTime = Math.pow(2, attempt) * 30000;
          console.log(`⏳ Rate limit hit, waiting ${waitTime / 1000}s before retry (attempt ${attempt + 1}/${maxRetries})...`);
          
          // Wait in smaller chunks to allow cancellation checks
          const checkInterval = 1000; // Check every second
          for (let waited = 0; waited < waitTime; waited += checkInterval) {
            if (this.shouldCancel) {
              throw new Error('Generation cancelled by user');
            }
            await this.delay(Math.min(checkInterval, waitTime - waited));
          }
        } else if (attempt === maxRetries - 1) {
          throw error;
        }
      }
    }
    throw new Error('Max retries exceeded');
  }
  
  private updateQueuePositions() {
    this.queue.forEach((job, index) => {
      const position = index + 1;
      const waitMinutes = position * 4;
      job.onProgress(0, `You're #${position} in queue. Estimated wait: ${waitMinutes} minute${waitMinutes === 1 ? '' : 's'} ⏱️`);
    });
  }
  
  private canGenerateBook(pageCount: number): boolean {
    this.checkDailyReset();
    const usage = this.getDailyUsage();
    return (usage.count + pageCount) <= this.DAILY_LIMIT;
  }
  
  private getDailyUsage(): DailyUsage {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (!stored) {
      return { count: 0, date: new Date().toISOString().split('T')[0] };
    }
    return JSON.parse(stored);
  }
  
  private incrementDailyUsage() {
    const usage = this.getDailyUsage();
    usage.count++;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(usage));
  }
  
  private checkDailyReset() {
    const usage = this.getDailyUsage();
    const today = new Date().toISOString().split('T')[0];
    
    if (usage.date !== today) {
      // Reset counter for new day
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({ count: 0, date: today }));
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  getStatus() {
    this.checkDailyReset();
    const usage = this.getDailyUsage();
    const remaining = Math.max(0, this.DAILY_LIMIT - usage.count);
    const booksRemaining = Math.floor(remaining / this.CALLS_PER_BOOK);
    
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      currentJobId: this.currentJobId,
      isCancelling: this.shouldCancel,
      dailyUsed: usage.count,
      dailyRemaining: remaining,
      booksRemaining,
      dailyLimit: this.DAILY_LIMIT
    };
  }
  
  getQueuePosition(jobId: string): number {
    const index = this.queue.findIndex(job => job.id === jobId);
    return index >= 0 ? index + 1 : 0;
  }
}

export const bookQueue = new BookGenerationQueue();
