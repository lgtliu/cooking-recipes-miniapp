Component({
  properties: {
    dish: {
      type: Object,
      value: { steps: [] }
    },
    height: {
      type: Number,
      value: 420
    }
  },
  methods: {
    handleTap() {
      this.triggerEvent('opendish', { id: this.data.dish.id });
    }
  }
});
