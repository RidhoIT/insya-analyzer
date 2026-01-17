import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileImage, Eye, MessageSquare, CheckCircle, AlertCircle, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import './App.css';

function App() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [extractedText, setExtractedText] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [progress, setProgress] = useState(0);
  const [analysisError, setAnalysisError] = useState(null);
  const fileInputRef = useRef(null);
  const [ocrError, setOcrError] = useState('');

  // Progress animation effect
  useEffect(() => {
    let interval;
    if (isProcessing) {
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return 90;
          return prev + Math.random() * 10;
        });
      }, 200);
    } else {
      setProgress(0);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

  // Handle file selection with drag and drop support
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    processFile(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    processFile(file);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const processFile = (file) => {
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      alert('حجم الملف كبير جداً. الحد الأقصى 10 ميجابايت');
      return;
    }
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file);
      setCurrentStep(2);

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target.result);
      };
      reader.readAsDataURL(file);

      // Reset previous results
      setExtractedText('');
      setAnalysisResult(null);
      setAnalysisError(null);
    } else {
      alert('يرجى اختيار ملف صورة صالح (PNG, JPG, JPEG)');
    }
  };

  // Improve error handling in processImageToText
  const processImageToText = async () => {
    if (!selectedImage) return;

    setIsProcessing(true);
    setCurrentStep(3);
    setProgress(0);

    const formData = new FormData();
    formData.append('image', selectedImage);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch('https://insya-analizer-backend.vercel.app/ocr', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.text && data.text.trim() !== 'لا يوجد نص عربي في الصورة') {
        setExtractedText(data.text);
        setCurrentStep(4);
      } else {
        alert('لم يتم العثور على نص عربي في الصورة');
        setCurrentStep(2);
      }
    } catch (error) {
      console.error('OCR Error:', error);
      if (error.name === 'AbortError') {
        alert('انتهت مهلة الطلب. يرجى المحاولة مرة أخرى');
      } else {
        alert('فشل في الاتصال بخادم استخراج النص');
      }
      setCurrentStep(2);
    } finally {
      setProgress(100);
      setIsProcessing(false);
    }
  };

  // Function to parse string analysis to structured object
  const parseAnalysisString = (analysisString) => {
    try {
      // If it's already an object, return it
      if (typeof analysisString === 'object' && analysisString !== null) {
        return analysisString;
      }

      // Create a basic structure from string analysis
      const analysis = {
        overallScore: 85,
        totalWords: extractedText.split(/\s+/).filter(word => word.trim()).length,
        totalSentences: extractedText.split(/[.!?؟]/).filter(s => s.trim()).length,
        readabilityLevel: 'متوسط',
        errors: [],
        strengths: [],
        recommendations: [],
        rawAnalysis: analysisString // Store original string analysis
      };

      // Try to extract information from the string
      const lines = analysisString.split('\n').filter(line => line.trim());
      
      let currentSection = '';
      lines.forEach(line => {
        const trimmedLine = line.trim();
        
        if (trimmedLine.includes('أخطاء النحو') || trimmedLine.includes('النحو')) {
          currentSection = 'grammar';
        } else if (trimmedLine.includes('أخطاء الصرف') || trimmedLine.includes('الصرف')) {
          currentSection = 'morphology';
        } else if (trimmedLine.includes('أخطاء الإملاء') || trimmedLine.includes('الإملاء')) {
          currentSection = 'spelling';
        } else if (trimmedLine.includes('أخطاء التركيب') || trimmedLine.includes('التركيب')) {
          currentSection = 'syntax';
        } else if (trimmedLine.includes('->') && currentSection) {
          // Extract error and correction
          const [error, correction] = trimmedLine.split('->').map(s => s.trim());
          if (error && correction) {
            analysis.errors.push({
              type: currentSection === 'grammar' ? 'نحوي' : 
                    currentSection === 'morphology' ? 'صرفي' :
                    currentSection === 'spelling' ? 'إملائي' : 'تركيبي',
              word: error,
              suggestion: correction,
              position: 'عام',
              severity: 'متوسط',
              explanation: `خطأ ${currentSection === 'grammar' ? 'نحوي' : 
                           currentSection === 'morphology' ? 'صرفي' :
                           currentSection === 'spelling' ? 'إملائي' : 'تركيبي'} تم اكتشافه`
            });
          }
        }
      });

      // Add default strengths and recommendations
      if (analysis.errors.length === 0) {
        analysis.strengths.push('النص سليم لغوياً', 'لا توجد أخطاء واضحة');
        analysis.overallScore = 95;
      } else {
        analysis.strengths.push('تم اكتشاف الأخطاء بنجاح', 'النص قابل للتحسين');
        analysis.overallScore = Math.max(60, 95 - (analysis.errors.length * 10));
      }

      analysis.recommendations.push(
        'راجع الأخطاء المكتشفة',
        'تأكد من قواعد النحو والصرف',
        'استخدم أدوات التدقيق اللغوي'
      );

      return analysis;
    } catch (error) {
      console.error('Error parsing analysis:', error);
      // Return fallback structure
      return {
        overallScore: 75,
        totalWords: extractedText.split(/\s+/).filter(word => word.trim()).length,
        totalSentences: extractedText.split(/[.!?؟]/).filter(s => s.trim()).length,
        readabilityLevel: 'متوسط',
        errors: [],
        strengths: ['تم استخراج النص بنجاح'],
        recommendations: ['يرجى إعادة المحاولة للحصول على تحليل أفضل'],
        rawAnalysis: analysisString
      };
    }
  };

  const generateAndAnalyze = async () => {
    setIsProcessing(true);
    setCurrentStep(5);
    setProgress(0);
    setAnalysisError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch('https://insya-analizer-backend.vercel.app/generate_and_analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: 'اكتب لي نصا عربيا قصيرا عن أهمية التعليم'
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Response data:', data);

      if (data.success && data.generated_text && data.analysis) {
        setExtractedText(data.generated_text);
        // Parse the analysis string to structured object
        const parsedAnalysis = parseAnalysisString(data.analysis);
        setAnalysisResult(parsedAnalysis);
        setCurrentStep(6);
      } else {
        throw new Error(data.error || 'Invalid response structure');
      }

    } catch (error) {
      console.error('Generate & Analyze failed:', error);
      
      let errorMessage = 'حدث خطأ أثناء توليد وتحليل النص';
      
      if (error.name === 'AbortError') {
        errorMessage = 'انتهت مهلة الطلب. يرجى المحاولة مرة أخرى';
      } else if (error.message.includes('Failed to fetch')) {
        errorMessage = 'فشل في الاتصال بالخادم. تأكد من تشغيل الخادم';
      } else if (error.message) {
        errorMessage = error.message;
      }

      setAnalysisError(errorMessage);
      
      // Generate fallback
      const fallbackText = 'إن التعليم أساس تقدم الأمم وازدهارها. فهو ينير العقول ويفتح آفاق المعرفة أمام الطلاب.';
      const fallbackAnalysis = {
        overallScore: 85,
        totalWords: fallbackText.split(/\s+/).length,
        totalSentences: fallbackText.split(/[.!?؟]/).filter(s => s.trim()).length,
        readabilityLevel: 'متوسط',
        errors: [],
        strengths: [
          'النص مقروء ومفهوم',
          'استخدام مفردات مناسبة',
          'ترابط منطقي بين الجمل'
        ],
        recommendations: [
          'يرجى إعادة المحاولة للحصول على تحليل دقيق',
          'تأكد من اتصال الإنترنت وتشغيل الخادم'
        ]
      };

      setExtractedText(fallbackText);
      setAnalysisResult(fallbackAnalysis);
      setCurrentStep(6);
      
    } finally {
      setProgress(100);
      setIsProcessing(false);
    }
  };

  // Real AI analysis calling the backend
  const analyzeText = async () => {
    if (!extractedText.trim()) return;

    setIsProcessing(true);
    setCurrentStep(5);
    setProgress(0);
    setAnalysisError(null);

    try {
      // const response = await fetch('http://localhost:5000/analyze_arabic', {
      const response = await fetch('https://insya-analizer-backend.vercel.app/analyze_arabic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: extractedText
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Parse the string analysis to structured object
        const parsedAnalysis = parseAnalysisString(data.analysis);
        setAnalysisResult(parsedAnalysis);
        setCurrentStep(6);
      } else {
        console.error('Analysis failed:', data);
        setAnalysisError(data.error || 'فشل في تحليل النص');

        // Fallback analysis
        const mockAnalysis = {
          overallScore: 85,
          totalWords: extractedText.split(/\s+/).length,
          totalSentences: extractedText.split(/[.!?؟]/).filter(s => s.trim()).length,
          readabilityLevel: 'متوسط',
          errors: [],
          strengths: [
            'النص مقروء ومفهوم',
            'توجد بنية أساسية للنص'
          ],
          recommendations: [
            'يرجى إعادة المحاولة للحصول على تحليل دقيق',
            'تأكد من اتصال الإنترنت'
          ]
        };

        setAnalysisResult(mockAnalysis);
        setCurrentStep(6);
      }
    } catch (error) {
      console.error('Analysis request failed:', error);
      setAnalysisError('فشل في الاتصال بخادم التحليل');

      // Basic fallback analysis
      const basicAnalysis = {
        overallScore: 70,
        totalWords: extractedText.split(/\s+/).length,
        totalSentences: extractedText.split(/[.!?؟]/).filter(s => s.trim()).length,
        readabilityLevel: 'متوسط',
        errors: [],
        strengths: [
          'النص تم استخراجه بنجاح',
          'يحتوي على محتوى عربي'
        ],
        recommendations: [
          'يرجى إعادة المحاولة لاحقاً للحصول على تحليل مفصل',
          'تأكد من تشغيل الخادم'
        ]
      };

      setAnalysisResult(basicAnalysis);
      setCurrentStep(6);
    }

    setProgress(100);
    setIsProcessing(false);
  };

  const resetAll = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setExtractedText('');
    setAnalysisResult(null);
    setAnalysisError(null);
    setCurrentStep(1);
    setProgress(0);
    setIsProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getSeverityClass = (severity) => {
    switch (severity) {
      case 'عالي': return 'severity-high';
      case 'متوسط': return 'severity-medium';
      case 'منخفض': return 'severity-low';
      default: return 'severity-medium';
    }
  };

  return (
    <div className="app-container">
      <div className="main-wrapper">
        {/* Header */}
        <header className="header">
          <h1>محلل النصوص العربية الذكي</h1>
          <p>استخراج وتحليل النصوص من الصور باستخدام الذكاء الاصطناعي مع تقديم توصيات لتحسين جودة النص</p>
        </header>

        {/* Progress Steps */}
        <div className="progress-container">
          <div className="progress-steps">
            {[
              { step: 1, label: 'رفع الصورة' },
              { step: 2, label: 'معاينة' },
              { step: 3, label: 'استخراج النص' },
              { step: 4, label: 'النص المستخرج' },
              { step: 5, label: 'التحليل' },
              { step: 6, label: 'النتائج' }
            ].map((item, index) => (
              <React.Fragment key={item.step}>
                <div className="progress-step">
                  <div className={`step-circle ${currentStep >= item.step ? 'active' : 'inactive'}`}>
                    {currentStep > item.step ? (
                      <CheckCircle size={20} />
                    ) : currentStep === item.step && isProcessing ? (
                      <Loader2 size={20} className="spinner" />
                    ) : (
                      item.step
                    )}
                  </div>
                </div>
                {index < 5 && (
                  <div className={`step-connector ${currentStep > item.step ? 'completed' : 'pending'}`}></div>
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="progress-label">
            <span>
              {currentStep === 1 && 'قم برفع صورة تحتوي على نص عربي'}
              {currentStep === 2 && 'معاينة الصورة المرفوعة'}
              {currentStep === 3 && `استخراج النص... ${Math.round(progress)}%`}
              {currentStep === 4 && 'النص جاهز للتحليل'}
              {currentStep === 5 && `تحليل النص... ${Math.round(progress)}%`}
              {currentStep === 6 && 'تم الانتهاء من التحليل'}
            </span>
          </div>
        </div>

        {/* Error Message */}
        {analysisError && (
          <div className="error-banner">
            <AlertCircle size={20} />
            <span>تحذير: {analysisError}. تم استخدام تحليل أساسي.</span>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="main-grid">
          {/* Left Column */}
          <div className="column">
            {/* Upload Section */}
            <div className="card">
              <div className="card-header">
                <Upload size={24} />
                رفع الصورة
              </div>

              {!imagePreview ? (
                <div
                  className="upload-area"
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                >
                  <FileImage size={48} />
                  <p>اسحب وأفلت الصورة هنا أو انقر للتصفح</p>
                  <p className="file-types">يدعم: PNG, JPG, JPEG (الحد الأقصى: 10MB)</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="image-preview">
                  <img src={imagePreview} alt="معاينة الصورة" className="preview-image" />
                  <div className="button-group">
                    <button
                      onClick={processImageToText}
                      disabled={isProcessing || !selectedImage}
                      className="btn btn-primary btn-extract"
                    >
                      {isProcessing && currentStep === 3 ? (
                        <>
                          <Loader2 size={20} className="spinner" />
                          استخراج النص... {Math.round(progress)}%
                        </>
                      ) : (
                        <>
                          <Eye size={20} />
                          استخراج النص
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="btn btn-secondary"
                    >
                      <RefreshCw size={20} />
                      تغيير الصورة
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Extracted Text Section */}
            {extractedText && (
              <div className="card">
                <div className="card-header">
                  <MessageSquare size={24} />
                  النص المستخرج
                </div>
                <div className="text-area-container">
                  <textarea
                    value={extractedText}
                    onChange={(e) => setExtractedText(e.target.value)}
                    className="text-area"
                    placeholder="النص المستخرج سيظهر هنا..."
                    readOnly={isProcessing}
                  />
                  <div className="text-stats">
                    كلمات: {extractedText.split(/\s+/).filter(word => word.trim()).length} |
                    أحرف: {extractedText.length}
                  </div>
                </div>
                <div className="button-group">
                  <button
                    onClick={analyzeText}
                    disabled={isProcessing || !extractedText.trim()}
                    className="btn btn-success"
                  >
                    {isProcessing && currentStep === 5 ? (
                      <>
                        <Loader2 size={20} className="spinner" />
                        تحليل النص... {Math.round(progress)}%
                      </>
                    ) : (
                      <>
                        <Sparkles size={20} />
                        تحليل النص
                      </>
                    )}
                  </button>
                  <button
                    onClick={generateAndAnalyze}
                    disabled={isProcessing}
                    className="btn btn-primary"
                  >
                    {isProcessing && currentStep === 5 ? (
                      <>
                        <Loader2 size={20} className="spinner" />
                        توليد وتحليل... {Math.round(progress)}%
                      </>
                    ) : (
                      <>
                        <Sparkles size={20} />
                        توليد نص وتحليل
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="column">
            {/* Analysis Results */}
            {analysisResult && (
              <>
             
                {/* Errors */}
                <div className="card">
                  <div className="card-header">
                    <AlertCircle size={24} />
                    الأخطاء المكتشفة ({(analysisResult.errors || []).length})
                  </div>
                  {(analysisResult.errors || []).length > 0 ? (
                    <div className="error-list">
                      {(analysisResult.errors || []).map((error, index) => (
                        <div key={index} className="error-item">
                          <div className="error-content">
                            <div className="error-details">
                              <div className="error-type">{error.type || 'غير محدد'}</div>
                              <div className="error-word">الكلمة: {error.word || 'غير محدد'}</div>
                              <div className="error-suggestion">الاقتراح: {error.suggestion || 'غير متاح'}</div>
                              <div className="error-position">{error.position || 'غير محدد'}</div>
                              <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'grey' }}>
                                {error.explanation || ''}
                              </div>
                            </div>
                            <div className={`severity-badge ${getSeverityClass(error.severity)}`}>
                              {error.severity || 'متوسط'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="no-errors">
                      <CheckCircle size={48} style={{ margin: '0 auto 1rem', display: 'block' }} />
                      لا توجد أخطاء! النص سليم لغوياً
                    </div>
                  )}
                </div>

                {/* Raw Analysis (if available) */}
                {analysisResult.rawAnalysis && (
                  <div className="card">
                    <div className="card-header">
                      <MessageSquare size={24} />
                      التحليل الكامل
                    </div>
                    <div style={{ 
                      backgroundColor: '#f8f9fa', 
                      padding: '1rem', 
                      borderRadius: '8px',
                      fontFamily: 'monospace',
                      fontSize: '0.9rem',
                      lineHeight: '1.5',
                      whiteSpace: 'pre-wrap',
                      textAlign: 'right',
                      direction: 'rtl'
                    }}>
                      {analysisResult.rawAnalysis}
                    </div>
                  </div>
                )}

                {/* Strengths */}
                {/*
               {(analysisResult.strengths || []).length > 0 && (
                  // <div className="card">
                  //   <div className="card-header">
                  //     <CheckCircle size={24} />
                  //     نقاط القوة
                  //   </div>
                  //   <div className="strengths-list">
                  //     {(analysisResult.strengths || []).map((strength, index) => (
                  //       <div key={index} className="strength-item">
                  //         <CheckCircle size={20} />
                  //         {strength}
                  //       </div>
                  //     ))}
                  //   </div>
                  // </div>
                )}
                  */}

                {/* Recommendations */}
                {(analysisResult.recommendations || []).length > 0 && (
                  <div className="card">
                    <div className="card-header">
                      <Sparkles size={24} />
                      التوصيات للتحسين
                    </div>
                    <div className="recommendations-list">
                      {(analysisResult.recommendations || []).map((recommendation, index) => (
                        <div key={index} className="recommendation-item">
                          <span className="recommendation-bullet">•</span>
                          {recommendation}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                   {/* Overall Score */}
                <div className="card">
                  <div className="card-header">
                    <CheckCircle size={24} />
                    النتيجة الإجمالية
                  </div>
                  <div className="score-container">
                    <div className="score-number">{analysisResult.overallScore || 0}</div>
                    <div className="score-info">
                      <div className="score-label">من 100</div>
                      <div className="score-quality">
                        جودة {(analysisResult.overallScore || 0) >= 80 ? 'ممتازة' :
                          (analysisResult.overallScore || 0) >= 60 ? 'جيدة' : 'تحتاج تحسين'}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: '1rem', textAlign: 'center', color: 'grey' }}>
                    <p>عدد الكلمات: {analysisResult.totalWords || 0} | عدد الجمل: {analysisResult.totalSentences || 0}</p>
                    <p>مستوى القراءة: {analysisResult.readabilityLevel || 'غير محدد'}</p>
                  </div>
                </div>

              </>
            )}
          </div>
        </div>

        {/* Reset Button */}
        {(selectedImage || extractedText || analysisResult) && (
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <button onClick={resetAll} className="btn btn-secondary">
              <RefreshCw size={20} />
              إعادة تعيين
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

// import React, { useState, useRef, useEffect } from 'react';
// import { Upload, FileImage, Eye, MessageSquare, CheckCircle, AlertCircle, Loader2, RefreshCw, Sparkles } from 'lucide-react';
// import './App.css';

// function App() {
//   const [selectedImage, setSelectedImage] = useState(null);
//   const [imagePreview, setImagePreview] = useState(null);
//   const [extractedText, setExtractedText] = useState('');
//   const [analysisResult, setAnalysisResult] = useState(null);
//   const [isProcessing, setIsProcessing] = useState(false);
//   const [currentStep, setCurrentStep] = useState(1);
//   const [progress, setProgress] = useState(0);
//   const [analysisError, setAnalysisError] = useState(null);
//   const fileInputRef = useRef(null);
//   const [ocrError, setOcrError] = useState('');

//   // Progress animation effect
//   useEffect(() => {
//     let interval;
//     if (isProcessing) {
//       interval = setInterval(() => {
//         setProgress(prev => {
//           if (prev >= 90) return 90;
//           return prev + Math.random() * 10;
//         });
//       }, 200);
//     } else {
//       setProgress(0);
//     }
//     return () => clearInterval(interval);
//   }, [isProcessing]);

//   // Handle file selection with drag and drop support
//   const handleFileSelect = (event) => {
//     const file = event.target.files[0];
//     processFile(file);
//   };

//   const handleDrop = (event) => {
//     event.preventDefault();
//     const file = event.dataTransfer.files[0];
//     processFile(file);
//   };

//   const handleDragOver = (event) => {
//     event.preventDefault();
//   };

//   const processFile = (file) => {
//     const maxSize = 10 * 1024 * 1024; // 10MB
//     if (file.size > maxSize) {
//       alert('حجم الملف كبير جداً. الحد الأقصى 10 ميجابايت');
//       return;
//     }
//     if (file && file.type.startsWith('image/')) {
//       setSelectedImage(file);
//       setCurrentStep(2);

//       // Create preview
//       const reader = new FileReader();
//       reader.onload = (e) => {
//         setImagePreview(e.target.result);
//       };
//       reader.readAsDataURL(file);

//       // Reset previous results
//       setExtractedText('');
//       setAnalysisResult(null);
//       setAnalysisError(null);
//     } else {
//       alert('يرجى اختيار ملف صورة صالح (PNG, JPG, JPEG)');
//     }
//   };

//   // Improve error handling in processImageToText
//   const processImageToText = async () => {
//     if (!selectedImage) return;

//     setIsProcessing(true);
//     setCurrentStep(3);
//     setProgress(0);

//     const formData = new FormData();
//     formData.append('image', selectedImage);

//     try {
//       const controller = new AbortController();
//       const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

//       const response = await fetch('https://insya-analizer-backend.vercel.app/ocr', {
//         method: 'POST',
//         body: formData,
//         signal: controller.signal
//       });

//       clearTimeout(timeoutId);

//       if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`);
//       }

//       const data = await response.json();

//       if (data.text && data.text.trim() !== 'لا يوجد نص عربي في الصورة') {
//         setExtractedText(data.text);
//         setCurrentStep(4);
//       } else {
//         alert('لم يتم العثور على نص عربي في الصورة');
//         setCurrentStep(2);
//       }
//     } catch (error) {
//       console.error('OCR Error:', error);
//       if (error.name === 'AbortError') {
//         alert('انتهت مهلة الطلب. يرجى المحاولة مرة أخرى');
//       } else {
//         alert('فشل في الاتصال بخادم استخراج النص');
//       }
//       setCurrentStep(2);
//     } finally {
//       setProgress(100);
//       setIsProcessing(false);
//     }
//   };

//   // Function to parse string analysis to structured object
//   const parseAnalysisString = (analysisString) => {
//     try {
//       // If it's already an object, return it
//       if (typeof analysisString === 'object' && analysisString !== null) {
//         return analysisString;
//       }

//       // Create a basic structure from string analysis
//       const analysis = {
//         overallScore: 85,
//         totalWords: extractedText.split(/\s+/).filter(word => word.trim()).length,
//         totalSentences: extractedText.split(/[.!?؟]/).filter(s => s.trim()).length,
//         readabilityLevel: 'متوسط',
//         errors: [],
//         strengths: [],
//         recommendations: [],
//         rawAnalysis: analysisString // Store original string analysis
//       };

//       // Try to extract information from the string
//       const lines = analysisString.split('\n').filter(line => line.trim());
      
//       let currentSection = '';
//       lines.forEach(line => {
//         const trimmedLine = line.trim();
        
//         if (trimmedLine.includes('أخطاء النحو') || trimmedLine.includes('النحو')) {
//           currentSection = 'grammar';
//         } else if (trimmedLine.includes('أخطاء الصرف') || trimmedLine.includes('الصرف')) {
//           currentSection = 'morphology';
//         } else if (trimmedLine.includes('أخطاء الإملاء') || trimmedLine.includes('الإملاء')) {
//           currentSection = 'spelling';
//         } else if (trimmedLine.includes('أخطاء التركيب') || trimmedLine.includes('التركيب')) {
//           currentSection = 'syntax';
//         } else if (trimmedLine.includes('->') && currentSection) {
//           // Extract error and correction
//           const [error, correction] = trimmedLine.split('->').map(s => s.trim());
//           if (error && correction) {
//             analysis.errors.push({
//               type: currentSection === 'grammar' ? 'نحوي' : 
//                     currentSection === 'morphology' ? 'صرفي' :
//                     currentSection === 'spelling' ? 'إملائي' : 'تركيبي',
//               word: error,
//               suggestion: correction,
//               position: 'عام',
//               severity: 'متوسط',
//               explanation: `خطأ ${currentSection === 'grammar' ? 'نحوي' : 
//                            currentSection === 'morphology' ? 'صرفي' :
//                            currentSection === 'spelling' ? 'إملائي' : 'تركيبي'} تم اكتشافه`
//             });
//           }
//         }
//       });

//       // Add default strengths and recommendations
//       if (analysis.errors.length === 0) {
//         analysis.strengths.push('النص سليم لغوياً', 'لا توجد أخطاء واضحة');
//         analysis.overallScore = 95;
//       } else {
//         analysis.strengths.push('تم اكتشاف الأخطاء بنجاح', 'النص قابل للتحسين');
//         analysis.overallScore = Math.max(60, 95 - (analysis.errors.length * 10));
//       }

//       analysis.recommendations.push(
//         'راجع الأخطاء المكتشفة',
//         'تأكد من قواعد النحو والصرف',
//         'استخدم أدوات التدقيق اللغوي'
//       );

//       return analysis;
//     } catch (error) {
//       console.error('Error parsing analysis:', error);
//       // Return fallback structure
//       return {
//         overallScore: 75,
//         totalWords: extractedText.split(/\s+/).filter(word => word.trim()).length,
//         totalSentences: extractedText.split(/[.!?؟]/).filter(s => s.trim()).length,
//         readabilityLevel: 'متوسط',
//         errors: [],
//         strengths: ['تم استخراج النص بنجاح'],
//         recommendations: ['يرجى إعادة المحاولة للحصول على تحليل أفضل'],
//         rawAnalysis: analysisString
//       };
//     }
//   };

//   const generateAndAnalyze = async () => {
//     setIsProcessing(true);
//     setCurrentStep(5);
//     setProgress(0);
//     setAnalysisError(null);

//     try {
//       const controller = new AbortController();
//       const timeoutId = setTimeout(() => controller.abort(), 60000);

//       const response = await fetch('https://insya-analizer-backend.vercel.app/generate_and_analyze', {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({
//           prompt: 'اكتب لي نصا عربيا قصيرا عن أهمية التعليم'
//         }),
//         signal: controller.signal
//       });

//       clearTimeout(timeoutId);

//       if (!response.ok) {
//         const errorData = await response.json().catch(() => ({}));
//         throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
//       }

//       const data = await response.json();
//       console.log('Response data:', data);

//       if (data.success && data.generated_text && data.analysis) {
//         setExtractedText(data.generated_text);
//         // Parse the analysis string to structured object
//         const parsedAnalysis = parseAnalysisString(data.analysis);
//         setAnalysisResult(parsedAnalysis);
//         setCurrentStep(6);
//       } else {
//         throw new Error(data.error || 'Invalid response structure');
//       }

//     } catch (error) {
//       console.error('Generate & Analyze failed:', error);
      
//       let errorMessage = 'حدث خطأ أثناء توليد وتحليل النص';
      
//       if (error.name === 'AbortError') {
//         errorMessage = 'انتهت مهلة الطلب. يرجى المحاولة مرة أخرى';
//       } else if (error.message.includes('Failed to fetch')) {
//         errorMessage = 'فشل في الاتصال بالخادم. تأكد من تشغيل الخادم';
//       } else if (error.message) {
//         errorMessage = error.message;
//       }

//       setAnalysisError(errorMessage);
      
//       // Generate fallback
//       const fallbackText = 'إن التعليم أساس تقدم الأمم وازدهارها. فهو ينير العقول ويفتح آفاق المعرفة أمام الطلاب.';
//       const fallbackAnalysis = {
//         overallScore: 85,
//         totalWords: fallbackText.split(/\s+/).length,
//         totalSentences: fallbackText.split(/[.!?؟]/).filter(s => s.trim()).length,
//         readabilityLevel: 'متوسط',
//         errors: [],
//         strengths: [
//           'النص مقروء ومفهوم',
//           'استخدام مفردات مناسبة',
//           'ترابط منطقي بين الجمل'
//         ],
//         recommendations: [
//           'يرجى إعادة المحاولة للحصول على تحليل دقيق',
//           'تأكد من اتصال الإنترنت وتشغيل الخادم'
//         ]
//       };

//       setExtractedText(fallbackText);
//       setAnalysisResult(fallbackAnalysis);
//       setCurrentStep(6);
      
//     } finally {
//       setProgress(100);
//       setIsProcessing(false);
//     }
//   };

//   // Real AI analysis calling the backend
//   const analyzeText = async () => {
//     if (!extractedText.trim()) return;

//     setIsProcessing(true);
//     setCurrentStep(5);
//     setProgress(0);
//     setAnalysisError(null);

//     try {
//       // const response = await fetch('http://localhost:5000/analyze_arabic', {
//       const response = await fetch('https://insya-analizer-backend.vercel.app/analyze_arabic', {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({
//           text: extractedText
//         })
//       });

//       const data = await response.json();

//       if (response.ok && data.success) {
//         // Parse the string analysis to structured object
//         const parsedAnalysis = parseAnalysisString(data.analysis);
//         setAnalysisResult(parsedAnalysis);
//         setCurrentStep(6);
//       } else {
//         console.error('Analysis failed:', data);
//         setAnalysisError(data.error || 'فشل في تحليل النص');

//         // Fallback analysis
//         const mockAnalysis = {
//           overallScore: 85,
//           totalWords: extractedText.split(/\s+/).length,
//           totalSentences: extractedText.split(/[.!?؟]/).filter(s => s.trim()).length,
//           readabilityLevel: 'متوسط',
//           errors: [],
//           strengths: [
//             'النص مقروء ومفهوم',
//             'توجد بنية أساسية للنص'
//           ],
//           recommendations: [
//             'يرجى إعادة المحاولة للحصول على تحليل دقيق',
//             'تأكد من اتصال الإنترنت'
//           ]
//         };

//         setAnalysisResult(mockAnalysis);
//         setCurrentStep(6);
//       }
//     } catch (error) {
//       console.error('Analysis request failed:', error);
//       setAnalysisError('فشل في الاتصال بخادم التحليل');

//       // Basic fallback analysis
//       const basicAnalysis = {
//         overallScore: 70,
//         totalWords: extractedText.split(/\s+/).length,
//         totalSentences: extractedText.split(/[.!?؟]/).filter(s => s.trim()).length,
//         readabilityLevel: 'متوسط',
//         errors: [],
//         strengths: [
//           'النص تم استخراجه بنجاح',
//           'يحتوي على محتوى عربي'
//         ],
//         recommendations: [
//           'يرجى إعادة المحاولة لاحقاً للحصول على تحليل مفصل',
//           'تأكد من تشغيل الخادم'
//         ]
//       };

//       setAnalysisResult(basicAnalysis);
//       setCurrentStep(6);
//     }

//     setProgress(100);
//     setIsProcessing(false);
//   };

//   const resetAll = () => {
//     setSelectedImage(null);
//     setImagePreview(null);
//     setExtractedText('');
//     setAnalysisResult(null);
//     setAnalysisError(null);
//     setCurrentStep(1);
//     setProgress(0);
//     setIsProcessing(false);
//     if (fileInputRef.current) {
//       fileInputRef.current.value = '';
//     }
//   };

//   const getSeverityClass = (severity) => {
//     switch (severity) {
//       case 'عالي': return 'severity-high';
//       case 'متوسط': return 'severity-medium';
//       case 'منخفض': return 'severity-low';
//       default: return 'severity-medium';
//     }
//   };

//   return (
//     <div className="app-container">
//       <div className="main-wrapper">
//         {/* Header */}
//         <header className="header">
//           <h1>محلل النصوص العربية الذكي</h1>
//           <p>استخراج وتحليل النصوص من الصور باستخدام الذكاء الاصطناعي مع تقديم توصيات لتحسين جودة النص</p>
//         </header>

//         {/* Progress Steps */}
//         <div className="progress-container">
//           <div className="progress-steps">
//             {[
//               { step: 1, label: 'رفع الصورة' },
//               { step: 2, label: 'معاينة' },
//               { step: 3, label: 'استخراج النص' },
//               { step: 4, label: 'النص المستخرج' },
//               { step: 5, label: 'التحليل' },
//               { step: 6, label: 'النتائج' }
//             ].map((item, index) => (
//               <React.Fragment key={item.step}>
//                 <div className="progress-step">
//                   <div className={`step-circle ${currentStep >= item.step ? 'active' : 'inactive'}`}>
//                     {currentStep > item.step ? (
//                       <CheckCircle size={20} />
//                     ) : currentStep === item.step && isProcessing ? (
//                       <Loader2 size={20} className="spinner" />
//                     ) : (
//                       item.step
//                     )}
//                   </div>
//                 </div>
//                 {index < 5 && (
//                   <div className={`step-connector ${currentStep > item.step ? 'completed' : 'pending'}`}></div>
//                 )}
//               </React.Fragment>
//             ))}
//           </div>
//           <div className="progress-label">
//             <span>
//               {currentStep === 1 && 'قم برفع صورة تحتوي على نص عربي'}
//               {currentStep === 2 && 'معاينة الصورة المرفوعة'}
//               {currentStep === 3 && `استخراج النص... ${Math.round(progress)}%`}
//               {currentStep === 4 && 'النص جاهز للتحليل'}
//               {currentStep === 5 && `تحليل النص... ${Math.round(progress)}%`}
//               {currentStep === 6 && 'تم الانتهاء من التحليل'}
//             </span>
//           </div>
//         </div>

//         {/* Error Message */}
//         {analysisError && (
//           <div className="error-banner">
//             <AlertCircle size={20} />
//             <span>تحذير: {analysisError}. تم استخدام تحليل أساسي.</span>
//           </div>
//         )}

//         {/* Main Content Grid */}
//         <div className="main-grid">
//           {/* Left Column */}
//           <div className="column">
//             {/* Upload Section */}
//             <div className="card">
//               <div className="card-header">
//                 <Upload size={24} />
//                 رفع الصورة
//               </div>

//               {!imagePreview ? (
//                 <div
//                   className="upload-area"
//                   onClick={() => fileInputRef.current?.click()}
//                   onDrop={handleDrop}
//                   onDragOver={handleDragOver}
//                 >
//                   <FileImage size={48} />
//                   <p>اسحب وأفلت الصورة هنا أو انقر للتصفح</p>
//                   <p className="file-types">يدعم: PNG, JPG, JPEG (الحد الأقصى: 10MB)</p>
//                   <input
//                     ref={fileInputRef}
//                     type="file"
//                     accept="image/*"
//                     onChange={handleFileSelect}
//                     className="hidden"
//                   />
//                 </div>
//               ) : (
//                 <div className="image-preview">
//                   <img src={imagePreview} alt="معاينة الصورة" className="preview-image" />
//                   <div className="button-group">
//                     <button
//                       onClick={processImageToText}
//                       disabled={isProcessing || !selectedImage}
//                       className="btn btn-primary btn-extract"
//                     >
//                       {isProcessing && currentStep === 3 ? (
//                         <>
//                           <Loader2 size={20} className="spinner" />
//                           استخراج النص... {Math.round(progress)}%
//                         </>
//                       ) : (
//                         <>
//                           <Eye size={20} />
//                           استخراج النص
//                         </>
//                       )}
//                     </button>
//                     <button
//                       onClick={() => fileInputRef.current?.click()}
//                       className="btn btn-secondary"
//                     >
//                       <RefreshCw size={20} />
//                       تغيير الصورة
//                     </button>
//                   </div>
//                 </div>
//               )}
//             </div>

//             {/* Extracted Text Section */}
//             {extractedText && (
//               <div className="card">
//                 <div className="card-header">
//                   <MessageSquare size={24} />
//                   النص المستخرج
//                 </div>
//                 <div className="text-area-container">
//                   <textarea
//                     value={extractedText}
//                     onChange={(e) => setExtractedText(e.target.value)}
//                     className="text-area"
//                     placeholder="النص المستخرج سيظهر هنا..."
//                     readOnly={isProcessing}
//                   />
//                   <div className="text-stats">
//                     كلمات: {extractedText.split(/\s+/).filter(word => word.trim()).length} |
//                     أحرف: {extractedText.length}
//                   </div>
//                 </div>
//                 <div className="button-group">
//                   <button
//                     onClick={analyzeText}
//                     disabled={isProcessing || !extractedText.trim()}
//                     className="btn btn-success"
//                   >
//                     {isProcessing && currentStep === 5 ? (
//                       <>
//                         <Loader2 size={20} className="spinner" />
//                         تحليل النص... {Math.round(progress)}%
//                       </>
//                     ) : (
//                       <>
//                         <Sparkles size={20} />
//                         تحليل النص
//                       </>
//                     )}
//                   </button>
//                   <button
//                     onClick={generateAndAnalyze}
//                     disabled={isProcessing}
//                     className="btn btn-primary"
//                   >
//                     {isProcessing && currentStep === 5 ? (
//                       <>
//                         <Loader2 size={20} className="spinner" />
//                         توليد وتحليل... {Math.round(progress)}%
//                       </>
//                     ) : (
//                       <>
//                         <Sparkles size={20} />
//                         توليد نص وتحليل
//                       </>
//                     )}
//                   </button>
//                 </div>
//               </div>
//             )}
//           </div>

//           {/* Right Column */}
//           <div className="column">
//             {/* Analysis Results */}
//             {analysisResult && (
//               <>
//                 {/* Overall Score */}
//                 <div className="card">
//                   <div className="card-header">
//                     <CheckCircle size={24} />
//                     النتيجة الإجمالية
//                   </div>
//                   <div className="score-container">
//                     <div className="score-number">{analysisResult.overallScore || 0}</div>
//                     <div className="score-info">
//                       <div className="score-label">من 100</div>
//                       <div className="score-quality">
//                         جودة {(analysisResult.overallScore || 0) >= 80 ? 'ممتازة' :
//                           (analysisResult.overallScore || 0) >= 60 ? 'جيدة' : 'تحتاج تحسين'}
//                       </div>
//                     </div>
//                   </div>
//                   <div style={{ marginTop: '1rem', textAlign: 'center', color: 'grey' }}>
//                     <p>عدد الكلمات: {analysisResult.totalWords || 0} | عدد الجمل: {analysisResult.totalSentences || 0}</p>
//                     <p>مستوى القراءة: {analysisResult.readabilityLevel || 'غير محدد'}</p>
//                   </div>
//                 </div>

//                 {/* Errors */}
//                 <div className="card">
//                   <div className="card-header">
//                     <AlertCircle size={24} />
//                     الأخطاء المكتشفة ({(analysisResult.errors || []).length})
//                   </div>
//                   {(analysisResult.errors || []).length > 0 ? (
//                     <div className="error-list">
//                       {(analysisResult.errors || []).map((error, index) => (
//                         <div key={index} className="error-item">
//                           <div className="error-content">
//                             <div className="error-details">
//                               <div className="error-type">{error.type || 'غير محدد'}</div>
//                               <div className="error-word">الكلمة: {error.word || 'غير محدد'}</div>
//                               <div className="error-suggestion">الاقتراح: {error.suggestion || 'غير متاح'}</div>
//                               <div className="error-position">{error.position || 'غير محدد'}</div>
//                               <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'grey' }}>
//                                 {error.explanation || ''}
//                               </div>
//                             </div>
//                             <div className={`severity-badge ${getSeverityClass(error.severity)}`}>
//                               {error.severity || 'متوسط'}
//                             </div>
//                           </div>
//                         </div>
//                       ))}
//                     </div>
//                   ) : (
//                     <div className="no-errors">
//                       <CheckCircle size={48} style={{ margin: '0 auto 1rem', display: 'block' }} />
//                       لا توجد أخطاء! النص سليم لغوياً
//                     </div>
//                   )}
//                 </div>

//                 {/* Raw Analysis (if available) */}
//                 {analysisResult.rawAnalysis && (
//                   <div className="card">
//                     <div className="card-header">
//                       <MessageSquare size={24} />
//                       التحليل الكامل
//                     </div>
//                     <div style={{ 
//                       backgroundColor: '#f8f9fa', 
//                       padding: '1rem', 
//                       borderRadius: '8px',
//                       fontFamily: 'monospace',
//                       fontSize: '0.9rem',
//                       lineHeight: '1.5',
//                       whiteSpace: 'pre-wrap',
//                       textAlign: 'right',
//                       direction: 'rtl'
//                     }}>
//                       {analysisResult.rawAnalysis}
//                     </div>
//                   </div>
//                 )}

//                 {/* Strengths */}
//                 {(analysisResult.strengths || []).length > 0 && (
//                   <div className="card">
//                     <div className="card-header">
//                       <CheckCircle size={24} />
//                       نقاط القوة
//                     </div>
//                     <div className="strengths-list">
//                       {(analysisResult.strengths || []).map((strength, index) => (
//                         <div key={index} className="strength-item">
//                           <CheckCircle size={20} />
//                           {strength}
//                         </div>
//                       ))}
//                     </div>
//                   </div>
//                 )}

//                 {/* Recommendations */}
//                 {(analysisResult.recommendations || []).length > 0 && (
//                   <div className="card">
//                     <div className="card-header">
//                       <Sparkles size={24} />
//                       التوصيات للتحسين
//                     </div>
//                     <div className="recommendations-list">
//                       {(analysisResult.recommendations || []).map((recommendation, index) => (
//                         <div key={index} className="recommendation-item">
//                           <span className="recommendation-bullet">•</span>
//                           {recommendation}
//                         </div>
//                       ))}
//                     </div>
//                   </div>
//                 )}
//               </>
//             )}
//           </div>
//         </div>

//         {/* Reset Button */}
//         {(selectedImage || extractedText || analysisResult) && (
//           <div style={{ textAlign: 'center', marginTop: '2rem' }}>
//             <button onClick={resetAll} className="btn btn-secondary">
//               <RefreshCw size={20} />
//               إعادة تعيين
//             </button>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

// export default App;
