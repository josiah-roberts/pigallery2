import {IExtensionEvent, IExtensionEvents} from './IExtension';
import {ExtensionEvent} from './ExtensionEvent';

export class ExtensionDecoratorObject {
  public static events: IExtensionEvents;

  static init(events: IExtensionEvents) {
    this.events = events;
  }

}

export const ExtensionDecorator = <I extends [], O>(fn: (ee: IExtensionEvents) => IExtensionEvent<I, O>) => {
  return (
    target: unknown,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) => {

    const targetMethod = descriptor.value;
    descriptor.value = async function(...args: I) {
      if (!ExtensionDecoratorObject.events) {
        return await targetMethod.apply(this, args);
      }

      const event = fn(ExtensionDecoratorObject.events) as ExtensionEvent<I, O>;
      const eventObj = {stopPropagation: false};
      const input = await event.triggerBefore({inputs: args}, eventObj);

      // skip the rest of the execution if the before handler asked for stop propagation
      if (eventObj.stopPropagation) {
        return input as O;
      }
      const out = await targetMethod.apply(this, args);
      return await event.triggerAfter(out);
    };

    return descriptor;
  };
};
