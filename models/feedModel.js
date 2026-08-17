const mongoose = require("mongoose");
const { prithuDB } = require("../database");
const feedSchema = new mongoose.Schema(
  {
    // UPLOAD TYPE: Normal OR Template
    uploadType: {
      type: String,
      enum: ["normal", "template"],
      required: true,
      default: "normal"
    },
    // Post type: image, video, image+audio
    postType: {
      type: String,
      enum: ["image", "video", "image+audio"],
      required: true
    },
    // Upload mode for each file (normal/template)
    uploadMode: {
      type: String,
      enum: ["normal", "template"],
      default: "normal"
    },
    language: {
      type: String,
      default: "en"
    },
    category: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Categories",
        required: true,
      },
    ],
    // Duration for videos and audio
    duration: { type: Number, default: null },
    // Primary media URL
    mediaUrl: { type: String, required: true },
    // Multiple files support with upload mode per file
    files: [{
      url: { type: String, required: true },
      type: {
        type: String,
        enum: ["image", "video", "audio"],
        required: true
      },
      uploadMode: {
        type: String,
        enum: ["normal", "template"],
        default: "normal"
      },
      mimeType: { type: String },
      size: { type: Number },
      driveFileId: { type: String }, // Google Drive file ID
      thumbnail: { type: String },
      duration: { type: Number },
      order: { type: Number, default: 0 },
      dimensions: {
        width: { type: Number },
        height: { type: Number },
        ratio: { type: Number }
      }
    }],
    // Optional audio file for image+audio templates
    audioFile: {
      url: { type: String },
      driveFileId: { type: String },
      mimeType: { type: String },
      size: { type: Number },
      duration: { type: Number }
    },
    // Description/caption
    caption: { type: String, default: "" },
    // File hash for duplicate detection
    fileHash: {
      type: String,
      sparse: true
    },
    // Creator information
    postedBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "roleRef",
        required: true,
      },
      name: { type: String },
      profilePicture: { type: String },
      role: { type: String }
    },
    roleRef: {
      type: String,
      enum: ["Admin", "Child_Admin", "User"],
      default: "User",
    },
    createdByAccount: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "roleRef",
      index: true
    },
    // ========== MODERATION & WORKFLOW ==========
    isApproved: {
      type: Boolean,
      default: false,
      index: true
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin"
    },
    moderatedAt: { type: Date },
    rejectionReason: { type: String },
    adminNotes: { type: String },

    // Administrative visibility
    isFeatured: {
      type: Boolean,
      default: false,
      index: true
    },
    priority: {
      type: Number,
      default: 0,
      index: true
    },
    // ========== TEMPLATE DESIGN METADATA ==========
    designMetadata: {
      isTemplate: { type: Boolean, default: false },
      templateName: { type: String },
      overlayElements: [{
        id: {
          type: String,
          required: true
        },
        type: {
          type: String,
          enum: ["avatar", "logo", "text", "username", "shape", "watermark", "dynamicText", "calendar", "image"],
          required: true
        },
        xPercent: { type: Number, required: true },
        yPercent: { type: Number, required: true },
        wPercent: { type: Number, required: true },
        hPercent: { type: Number, required: true },
        animation: {
          enabled: { type: Boolean, default: false },
          direction: {
            type: String,
            enum: ["top", "top-right", "right", "bottom-right",
              "bottom", "bottom-left", "left", "top-left", "none"],
            default: "top"
          },
          speed: {
            type: Number,
            default: 1,
            min: 0.1,
            max: 5
          },
          delay: { type: Number, default: 0 },
          finalStopPosition: {
            xPercent: { type: Number },
            yPercent: { type: Number }
          }
        },
        visible: { type: Boolean, default: true },
        zIndex: { type: Number, default: 10 },
        avatarConfig: {
          shape: {
            type: String,
            enum: ["circle", "square", "round"],
            default: "circle"
          },
          borderColor: { type: String, default: "#ffffff" },
          borderWidth: { type: Number, default: 2 },
          shadow: { type: Boolean, default: true },
          softEdgeConfig: {
            enabled: { type: Boolean, default: false },
            brushSize: { type: Number, default: 20 },
            blurStrength: { type: Number, default: 10 },
            opacity: { type: Number, default: 1 },
            strokes: [{
              x: { type: Number },
              y: { type: Number },
              r: { type: Number },
              blur: { type: Number },
              opacity: { type: Number }
            }]
          }
        },
        textConfig: {
          content: { type: String },
          fontFamily: { type: String, default: "Arial" },
          fontSize: { type: Number, default: 16 },
          fontWeight: { type: String, default: "normal" },
          color: { type: String, default: "#ffffff" },
          backgroundColor: { type: String },
          padding: { type: Number, default: 5 },
          lineHeight: { type: Number, default: 1.2 },
          align: {
            type: String,
            enum: ["left", "center", "right"],
            default: "center"
          }
        },
        mediaConfig: {
          url: { type: String },
          opacity: { type: Number, default: 1, min: 0, max: 1 },
          maintainAspectRatio: { type: Boolean, default: true }
        },
        shapeConfig: {
          type: {
            type: String,
            enum: ["rectangle", "circle", "triangle", "line", "ellipse"]
          },
          fillColor: { type: String, default: "#ffffff" },
          strokeColor: { type: String, default: "#000000" },
          strokeWidth: { type: Number, default: 1 },
          borderRadius: { type: Number, default: 0 }
        },
        calendarConfig: {
          headerColor: { type: String, default: "#E54B35" },
          bodyColor: { type: String, default: "#F9F9F9" }
        },
        metadata: {
          type: mongoose.Schema.Types.Mixed,
          default: {}
        }
      }],
      audioConfig: {
        enabled: { type: Boolean, default: false },
        audioFileId: { type: String },
        crop: {
          start: { type: Number, default: 0 },
          end: { type: Number },
          duration: { type: Number }
        },
        volume: { type: Number, default: 1, min: 0, max: 1 },
        loop: { type: Boolean, default: false },
        fadeIn: { type: Number, default: 0 },
        fadeOut: { type: Number, default: 0 }
      },
      footerConfig: {
        enabled: { type: Boolean, default: false },
        position: {
          type: String,
          enum: ["bottom", "top", "left", "right"],
          default: "bottom"
        },
        heightPercent: { type: Number, default: 15, min: 5, max: 30 },
        backgroundColor: { type: String, default: "rgba(0,0,0,0.7)" },
        textColor: { type: String, default: "#ffffff" },
        showElements: {
          name: { type: Boolean, default: true },
          email: { type: Boolean, default: false },
          phone: { type: Boolean, default: false },
          socialIcons: { type: Boolean, default: true }
        },
        socialIcons: [{
          platform: {
            type: String,
            enum: ["facebook", "instagram", "twitter", "linkedin",
              "youtube", "whatsapp", "telegram", "website"]
          },
          visible: { type: Boolean, default: true },
          urlTemplate: { type: String }
        }],
        useDominantColor: { type: Boolean, default: true },
        dominantColor: { type: String }
      },
      canvasSettings: {
        referenceWidth: { type: Number, default: 1080 },
        referenceHeight: { type: Number, default: 1920 },
        aspectRatio: { type: String, default: "9:16" },
        zoom: { type: Number, default: 1, min: 0.1, max: 5 },
        backgroundColor: { type: String, default: "transparent" },
        safeArea: {
          top: { type: Number, default: 50 },
          bottom: { type: Number, default: 100 },
          left: { type: Number, default: 20 },
          right: { type: Number, default: 20 }
        }
      },
      theme: {
        primaryColor: {
          type: String,
          default: "#1e5a78",
          validate: {
            validator: function (v) {
              return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
            }
          }
        },
        secondaryColor: { type: String, default: "#0f3a4d" },
        accentColor: { type: String, default: "#ff6b6b" },
        textColor: { type: String, default: "#ffffff" },
        backgroundGradient: { type: String }
      },
      playbackSettings: {
        autoPlay: { type: Boolean, default: true },
        loop: { type: Boolean, default: false },
        muteByDefault: { type: Boolean, default: true },
        restartOnView: { type: Boolean, default: true },
        pauseOnHidden: { type: Boolean, default: true }
      }
    },
    hashtags: [{
      type: String,
      lowercase: true
    }],
    taggedUsers: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
      },
      userName: { type: String },
      name: { type: String },
      taggedAt: { type: Date, default: Date.now }
    }],
    editMetadata: {
      crop: {
        ratio: {
          type: String,
          enum: ["original", "1:1", "4:5", "16:9", "9:16"],
          default: "original"
        },
        zoomLevel: { type: Number, default: 1, min: 0.1, max: 5 },
        position: {
          x: { type: Number, default: 0 },
          y: { type: Number, default: 0 }
        }
      },
      filters: {
        preset: {
          type: String,
          enum: ["original", "aden", "clarendon", "crema", "gingham", "juno",
            "lark", "ludwig", "moon", "perpetua", "reyes", "slumber"],
          default: "original"
        },
        adjustments: {
          brightness: { type: Number, default: 0, min: -100, max: 100 },
          contrast: { type: Number, default: 0, min: -100, max: 100 },
          saturation: { type: Number, default: 0, min: -100, max: 100 },
          fade: { type: Number, default: 0, min: 0, max: 100 },
          temperature: { type: Number, default: 0, min: -100, max: 100 },
          vignette: { type: Number, default: 0, min: 0, max: 100 }
        }
      }
    },
    audience: {
      type: String,
      enum: ["public", "private", "followers", "specific"],
      default: "public"
    },
    allowedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }],
    storage: {
      type: {
        type: String,
        enum: ["local", "s3", "cloudinary"],
        default: "local"
      },
      drive: {
        fileId: { type: String },
        thumbnailFileId: { type: String },
        audioFileId: { type: String },
        folderId: { type: String },
        webViewLink: { type: String },
        webContentLink: { type: String }
      },
      urls: {
        media: { type: String },
        audio: { type: String },
        thumbnail: { type: String },
        download: { type: String }
      }
    },
    location: {
      name: { type: String },
      coordinates: {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: { type: [Number], default: [0, 0] }
      }
    },
    statsId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeedStats",
      index: true,
    },
    isScheduled: {
      type: Boolean,
      default: false,
      index: true
    },
    scheduleDate: {
      type: Date,
      default: null,
      index: true
    },
    status: {
      type: String,
      enum: ["draft", "published", "scheduled", "archived", "deleted"],
      default: "published"
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date,
      index: true
    },
    version: {
      type: Number,
      default: 1
    },
    previousVersions: [{
      caption: { type: String },
      files: [{
        url: { type: String },
        type: { type: String },
        driveFileId: { type: String },
        size: { type: Number }
      }],
      designMetadata: { type: mongoose.Schema.Types.Mixed },
      editedAt: { type: Date, default: Date.now },
      editedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      changeDescription: { type: String }
    }],
    downloads: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      downloadedAt: { type: Date, default: Date.now },
      generatedFileId: { type: String },
      downloadUrl: { type: String }
    }],
    playbackStats: {
      totalViews: { type: Number, default: 0 },
      uniqueViewers: { type: Number, default: 0 },
      averageViewTime: { type: Number, default: 0 },
      completionRate: { type: Number, default: 0 },
      totalWatchTime: { type: Number, default: 0 },
      replays: { type: Number, default: 0 },
      pauses: { type: Number, default: 0 },
      skips: { type: Number, default: 0 },
    },
    engagementStats: {
      likes: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      saves: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      dislikes: { type: Number, default: 0 },
    },
    seoMetadata: {
      title: { type: String },
      description: { type: String },
      keywords: [{ type: String }],
      focusKeyword: { type: String },
      slug: { type: String, unique: true, sparse: true },
      isIndexed: { type: Boolean, default: true },
      ogImage: { type: String },
      ogTitle: { type: String },
      ogDescription: { type: String },
      jsonLd: { type: String },
      seoScore: { type: Number, default: 0 }
    },
    // ========== VIDEO COMPRESSION TRACKING ==========
    isCompressed: {
      type: Boolean,
      default: false,
      index: true
    },
    compressionStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true
    },
    compressionError: { type: String },
    compressionLocked: {
      type: Boolean,
      default: false,
      index: true
    },
    compressionStartedAt: { type: Date },
    compressionCompletedAt: { type: Date },
    // ========== ML RECOMMENDATION METADATA (v2) ==========
    mlMetadata: {
        analyzed: { type: Boolean, default: false, index: true },
        analyzedAt: { type: Date },
        aiVersion: { type: Number, default: 1 }, // v1 = Basic, v2 = Deep AI
        
        contentType: { type: String }, // e.g., "repair-engineering", "love"
        subCategory: { type: String }, // e.g., "electronics-repair", "romantic"
        emotion: { type: String },     // e.g., "happy", "motivational"
        
        topics: [{ type: String }],
        detectedObjects: [{ type: String }],
        speechKeywords: [{ type: String }],
        extractedText: [{ type: String }],       // From OCR
        
        recommendationTags: [{ type: String }],
        autoKeywords: [{ type: String }],        // NLP keywords
        generatedHashtags: [{ type: String }],   // AI-suggested hashtags
        
        freshnessScore: { type: Number, default: 1 },
        confidenceScore: { type: Number, default: 0 },
        
        embeddingGenerated: { type: Boolean, default: false },
        processingStatus: { 
            type: String, 
            enum: ["pending", "processing", "completed", "failed"], 
            default: "pending",
            index: true
        },
        errorMessage: { type: String }
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.fileHash;
        return ret;
      }
    }
  }
);
// Primary indexes for Admin Dashboard
feedSchema.index({ createdAt: -1 });
feedSchema.index({ isApproved: 1, status: 1 });
feedSchema.index({ isFeatured: 1, priority: -1 });
feedSchema.index({ category: 1, createdAt: -1 });
// Full text search update
feedSchema.index({
  caption: 'text',
  hashtags: 'text',
  'designMetadata.templateName': 'text'
}, {
  weights: {
    caption: 10,
    hashtags: 5,
    'designMetadata.templateName': 8
  },
  name: 'feed_text_search'
});
// ✅ isPublished virtual — true when the feed is live and visible to users
feedSchema.virtual('isPublished').get(function () {
  return (
    this.status === 'published' &&
    !this.isDeleted &&
    (!this.isScheduled || (this.scheduleDate && this.scheduleDate <= new Date()))
  );
});

// Middleware for Auto-Logic
feedSchema.pre("save", function () {
  // Auto-set uploadType if missing but design metadata suggests template
  if (this.designMetadata?.isTemplate && !this.uploadType) {
    this.uploadType = 'template';
  }
  // Set postType based on files
  if (this.isModified('files') || this.isModified('designMetadata')) {
    if (this.files?.some(f => f.type === 'video')) {
      this.postType = 'video';
    } else if (this.designMetadata?.audioConfig?.enabled) {
      this.postType = 'image+audio';
    } else if (this.files?.some(f => f.type === 'image')) {
      this.postType = 'image';
    }
  }
  // ✅ AUTO-EXTRACT HASHTAGS from caption whenever caption changes
  if (this.isModified('caption') && this.caption) {
    const rawTags = this.caption.match(/#([\w]+)/g) || [];
    const cleaned = rawTags.map(tag =>
      tag.replace(/^#/, '')          // remove leading #
        .toLowerCase()              // lowercase
        .replace(/[^a-z0-9_]/g, '') // remove special chars
        .trim()
    ).filter(Boolean);
    // Deduplicate
    this.hashtags = [...new Set(cleaned)];
  }

  // ✅ PREVENT WHITE FOOTER - replace white/near-white footer background with dark fallback
  if (this.designMetadata?.footerConfig?.backgroundColor) {
    const isWhiteOrLight = (color) => {
      if (!color) return false;
      const c = color.trim().toLowerCase();
      if (c === 'white' || c === '#fff' || c === '#ffffff') return true;
      const rgbMatch = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1]), g = parseInt(rgbMatch[2]), b = parseInt(rgbMatch[3]);
        return r > 220 && g > 220 && b > 220;
      }
      const hex6 = c.match(/^#([0-9a-f]{6})$/);
      if (hex6) {
        const r = parseInt(hex6[1].slice(0,2), 16), g = parseInt(hex6[1].slice(2,4), 16), b = parseInt(hex6[1].slice(4,6), 16);
        return r > 220 && g > 220 && b > 220;
      }
      const hex3 = c.match(/^#([0-9a-f]{3})$/);
      if (hex3) {
        const r = parseInt(hex3[1][0]+hex3[1][0], 16), g = parseInt(hex3[1][1]+hex3[1][1], 16), b = parseInt(hex3[1][2]+hex3[1][2], 16);
        return r > 220 && g > 220 && b > 220;
      }
      return false;
    };
    if (isWhiteOrLight(this.designMetadata.footerConfig.backgroundColor)) {
      this.designMetadata.footerConfig.backgroundColor = 'rgba(26,26,46,0.92)';
    }
  }
});
// Methods for history tracking
feedSchema.methods.saveEditHistory = async function (userId, description) {
  const currentData = this.toObject();
  const historyEntry = {
    caption: currentData.caption,
    files: currentData.files?.map(f => ({
      url: f.url,
      type: f.type,
      driveFileId: f.driveFileId,
      size: f.size
    })),
    designMetadata: currentData.designMetadata,
    editedAt: new Date(),
    editedBy: userId,
    changeDescription: description
  };

  this.previousVersions.push(historyEntry);
  this.version = (this.version || 1) + 1;
};

module.exports = prithuDB.model("Feed", feedSchema, "Feeds");